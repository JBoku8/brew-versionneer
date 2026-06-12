import { useCallback, useEffect, useRef, useState } from "react";
import {
  OutdatedResult,
  TabId,
  getInstalledFormulae,
  getInstalledVersions,
  getOutdatedFormulae,
  packageName,
  packageVersion,
  updateTrayCount,
  upgradePackages,
} from "../../api/tauri";
import { EMPTY_OUTDATED } from "../../constants/brew";
import { deriveBrewState } from "../../lib/brew";
import { getErrorMessage } from "../../lib/errors";
import { BrewShellProps, LlmContextProps } from "../../models/ui";
import { PackageList } from "../packages";
import { SetupAssistant } from "../packages/SetupAssistant";
import { UpgradePanel, UpgradeState } from "../packages/UpgradePanel";
import "./AppLayout.css";

interface AppLayoutProps extends BrewShellProps, LlmContextProps {
  activeTab: TabId;
  /** True when the sidebar "AI Assistant" view is selected. */
  assistantActive: boolean;
  /** Incremented by the sidebar "Refresh data" button. */
  refreshToken: number;
}

export function AppLayout({
  brewStatus,
  brewChecking,
  activeTab,
  assistantActive,
  refreshToken,
  llmConfig,
  apiKey,
  onOpenSettings,
}: AppLayoutProps) {
  const { brewInstalled, brewPending } = deriveBrewState(brewStatus, brewChecking);

  const [installedVersions, setInstalledVersions] = useState<Record<string, string>>({});
  const [outdatedResult, setOutdatedResult] = useState<OutdatedResult>(EMPTY_OUTDATED);
  const [installedReady, setInstalledReady] = useState(false);
  const [upgrade, setUpgrade] = useState<UpgradeState | null>(null);
  const loadGeneration = useRef(0);

  const loadInstalledData = useCallback(() => {
    const generation = ++loadGeneration.current;

    if (!brewInstalled) {
      setInstalledVersions({});
      setOutdatedResult(EMPTY_OUTDATED);
      setInstalledReady(true);
      return;
    }

    setInstalledReady(false);

    async function loadVersions() {
      try {
        const versions = await getInstalledVersions();
        if (generation !== loadGeneration.current) return;
        setInstalledVersions(versions);
      } catch {
        if (generation !== loadGeneration.current) return;
        try {
          const pkgs = await getInstalledFormulae();
          if (generation !== loadGeneration.current) return;
          const map: Record<string, string> = {};
          for (const pkg of pkgs) {
            const n = packageName(pkg);
            const v = packageVersion(pkg);
            if (n !== "unknown" && v) map[n] = v;
          }
          setInstalledVersions(map);
        } catch {
          // Both paths failed; installed list will be empty but UI stays unblocked.
        }
      } finally {
        if (generation === loadGeneration.current) {
          setInstalledReady(true);
        }
      }
    }

    async function loadOutdated() {
      try {
        const outdated = await getOutdatedFormulae();
        if (generation !== loadGeneration.current) return;
        setOutdatedResult(outdated);
      } catch {
        // Outdated badges stay empty — list is already visible.
      }
    }

    void loadVersions();
    void loadOutdated();
  }, [brewInstalled]);

  useEffect(() => {
    if (brewPending) {
      setInstalledReady(false);
      return;
    }
    if (brewChecking) {
      return;
    }
    loadInstalledData();
  }, [brewPending, brewChecking, loadInstalledData]);

  // Sidebar "Refresh data": reload installed + outdated (token 0 = initial mount, skip).
  const lastRefreshToken = useRef(refreshToken);
  useEffect(() => {
    if (refreshToken === lastRefreshToken.current) return;
    lastRefreshToken.current = refreshToken;
    loadInstalledData();
  }, [refreshToken, loadInstalledData]);

  // Keep the menu-bar tray badge in sync with the outdated count.
  useEffect(() => {
    if (!installedReady) return;
    void updateTrayCount(outdatedResult.formulae.length).catch(() => {
      // Tray is cosmetic — ignore failures.
    });
  }, [installedReady, outdatedResult]);

  // Ref (not state) guards double-starts: state updaters must stay pure
  // (StrictMode replays them), so the subprocess launch lives out here.
  const upgradeRunningRef = useRef(false);
  const startUpgrade = useCallback(
    (names: string[]) => {
      if (names.length === 0 || upgradeRunningRef.current) return;
      upgradeRunningRef.current = true;
      setUpgrade({ names, lines: [], running: true, error: null });
      void (async () => {
        try {
          await upgradePackages(names, (line) => {
            setUpgrade((s) => (s && s.running ? { ...s, lines: [...s.lines, line] } : s));
          });
          setUpgrade((s) => (s ? { ...s, running: false } : s));
        } catch (err) {
          const message = getErrorMessage(err);
          setUpgrade((s) => (s ? { ...s, running: false, error: message } : s));
        } finally {
          upgradeRunningRef.current = false;
          // Partial upgrades may have landed even on failure — refresh either way.
          loadInstalledData();
        }
      })();
    },
    [loadInstalledData],
  );

  return (
    <div className="app-layout">
      <main className="app-main">
        {/* Both views stay mounted so package selection and assistant chat survive switches */}
        <div className={assistantActive ? "view-hidden" : "view-host"}>
          <PackageList
            activeTab={activeTab}
            refreshToken={refreshToken}
            brewInstalled={brewInstalled}
            installedVersions={installedVersions}
            outdatedResult={outdatedResult}
            installedReady={installedReady}
            onRefreshInstalled={loadInstalledData}
            onUpgrade={startUpgrade}
            upgradeRunning={upgrade?.running ?? false}
            llmConfig={llmConfig}
            apiKey={apiKey}
            onOpenSettings={onOpenSettings}
          />
        </div>
        <div className={assistantActive ? "view-host" : "view-hidden"}>
          <SetupAssistant
            installedVersions={installedVersions}
            outdatedResult={outdatedResult}
            installedReady={installedReady}
            llmConfig={llmConfig}
            apiKey={apiKey}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </main>
      {upgrade && <UpgradePanel upgrade={upgrade} onClose={() => setUpgrade(null)} />}
    </div>
  );
}
