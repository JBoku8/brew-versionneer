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
  upgradeCancel,
  upgradePackages,
  upgradeRespond,
} from "../../api/tauri";
import { EMPTY_OUTDATED } from "../../constants/brew";
import { deriveBrewState } from "../../lib/brew";
import { getErrorMessage } from "../../lib/errors";
import {
  detectUpgradeBlockerFromLines,
  detectUpgradePromptFromLines,
} from "../../lib/upgrade";
import { BrewShellProps, LlmContextProps } from "../../models/ui";
import { PackageList } from "../packages";
import { SetupAssistant } from "../packages/SetupAssistant";
import { UpgradePanel, UpgradePhase, UpgradeState } from "../packages/UpgradePanel";
import "./AppLayout.css";

interface AppLayoutProps extends BrewShellProps, LlmContextProps {
  activeTab: TabId;
  /** True when the sidebar "AI Assistant" view is selected. */
  assistantActive: boolean;
  /** Incremented by the sidebar "Refresh data" button. */
  refreshToken: number;
}

function appendUpgradeLine(state: UpgradeState, line: string): UpgradeState {
  const lines = [...state.lines, line];
  const blocker = state.blocker ?? detectUpgradeBlockerFromLines(lines);
  const unscanned = lines.slice(state.promptDismissedAt);
  const prompt = blocker
    ? null
    : state.prompt ??
      (state.responding ? null : detectUpgradePromptFromLines(unscanned));
  return { ...state, lines, blocker, prompt };
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

  const upgradeRunningRef = useRef(false);
  const activeUpgradeNames = useRef<string[]>([]);
  const upgradeGeneration = useRef(0);
  const upgradePhaseRef = useRef<UpgradePhase | null>(null);
  const upgradeOutcomeRef = useRef<"cancelled" | "declined" | null>(null);

  useEffect(() => {
    upgradePhaseRef.current = upgrade?.phase ?? null;
  }, [upgrade?.phase]);

  const finishUpgrade = useCallback(() => {
    upgradeRunningRef.current = false;
    activeUpgradeNames.current = [];
    loadInstalledData();
  }, [loadInstalledData]);

  const invalidateUpgradeRun = useCallback(() => {
    upgradeGeneration.current += 1;
  }, []);

  const runUpgrade = useCallback(
    (names: string[]) => {
      const generation = ++upgradeGeneration.current;
      upgradeOutcomeRef.current = null;

      setUpgrade((s) =>
        s
          ? {
              ...s,
              phase: "running",
              lines: [],
              error: null,
              prompt: null,
              blocker: null,
              responding: false,
              promptDismissedAt: 0,
            }
          : s,
      );

      void (async () => {
        try {
          await upgradePackages(names, (line) => {
            if (generation !== upgradeGeneration.current) return;
            setUpgrade((s) => {
              if (!s || s.phase !== "running") return s;
              return appendUpgradeLine(s, line);
            });
          });
          if (generation !== upgradeGeneration.current) return;
          setUpgrade((s) =>
            s ? { ...s, phase: "done", prompt: null, blocker: null, responding: false } : s,
          );
        } catch (err) {
          if (generation !== upgradeGeneration.current) return;
          const message =
            upgradeOutcomeRef.current === "cancelled"
              ? "Upgrade cancelled."
              : upgradeOutcomeRef.current === "declined"
                ? "Upgrade declined."
                : getErrorMessage(err);
          setUpgrade((s) =>
            s
              ? {
                  ...s,
                  phase: "done",
                  prompt: null,
                  blocker: null,
                  responding: false,
                  error: message,
                }
              : s,
          );
        } finally {
          if (generation === upgradeGeneration.current) {
            upgradeOutcomeRef.current = null;
            finishUpgrade();
          }
        }
      })();
    },
    [finishUpgrade],
  );

  const startUpgrade = useCallback((names: string[]) => {
    if (names.length === 0 || upgradeRunningRef.current) return;
    upgradeRunningRef.current = true;
    activeUpgradeNames.current = names;
    upgradePhaseRef.current = "confirm";
    setUpgrade({
      names,
      lines: [],
      phase: "confirm",
      error: null,
      prompt: null,
      blocker: null,
      responding: false,
      promptDismissedAt: 0,
    });
  }, []);

  const confirmUpgrade = useCallback(() => {
    if (upgradePhaseRef.current !== "confirm") return;
    upgradePhaseRef.current = "running";
    const names = activeUpgradeNames.current;
    if (names.length === 0) return;
    runUpgrade(names);
  }, [runUpgrade]);

  const cancelUpgrade = useCallback(() => {
    if (upgradePhaseRef.current !== "confirm") return;
    upgradePhaseRef.current = null;
    upgradeRunningRef.current = false;
    activeUpgradeNames.current = [];
    setUpgrade(null);
  }, []);

  const abortUpgrade = useCallback(() => {
    if (upgradePhaseRef.current !== "running") return;
    upgradePhaseRef.current = "done";
    upgradeOutcomeRef.current = "cancelled";
    invalidateUpgradeRun();
    void upgradeCancel().finally(() => {
      finishUpgrade();
      setUpgrade((s) =>
        s
          ? {
              ...s,
              phase: "done",
              prompt: null,
              blocker: null,
              responding: false,
              error: "Upgrade cancelled.",
            }
          : s,
      );
    });
  }, [finishUpgrade, invalidateUpgradeRun]);

  const respondToPrompt = useCallback((response: string) => {
    if (response.startsWith("n")) {
      upgradeOutcomeRef.current = "declined";
    }
    setUpgrade((s) =>
      s
        ? { ...s, prompt: null, responding: true, promptDismissedAt: s.lines.length }
        : s,
    );
    void upgradeRespond(response)
      .catch((err) => {
        const message = getErrorMessage(err);
        setUpgrade((s) => (s && s.phase === "running" ? { ...s, error: message } : s));
      })
      .finally(() => {
        setUpgrade((s) => (s ? { ...s, responding: false } : s));
      });
  }, []);

  const closeUpgradePanel = useCallback(() => {
    setUpgrade(null);
  }, []);

  const upgradeActive = upgrade != null && upgrade.phase !== "done";

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
            upgradeRunning={upgradeActive}
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
      {upgrade && (
        <UpgradePanel
          upgrade={upgrade}
          onClose={closeUpgradePanel}
          onConfirm={confirmUpgrade}
          onCancel={cancelUpgrade}
          onAbort={abortUpgrade}
          onRespond={respondToPrompt}
        />
      )}
    </div>
  );
}
