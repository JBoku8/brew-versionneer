import { useCallback, useEffect, useRef, useState } from "react";
import {
  OutdatedResult,
  TabId,
  getInstalledFormulae,
  getInstalledVersions,
  getOutdatedFormulae,
  packageName,
  packageVersion,
} from "../../api/tauri";
import { EMPTY_OUTDATED } from "../../constants/brew";
import { deriveBrewState } from "../../lib/brew";
import { BrewShellProps, LlmContextProps } from "../../models/ui";
import { PackageList } from "../packages";
import "./AppLayout.css";

interface AppLayoutProps extends BrewShellProps, LlmContextProps {
  activeTab: TabId;
}

export function AppLayout({
  brewStatus,
  brewChecking,
  activeTab,
  llmConfig,
  apiKey,
  onOpenSettings,
}: AppLayoutProps) {
  const { brewInstalled, brewPending } = deriveBrewState(brewStatus, brewChecking);

  const [installedVersions, setInstalledVersions] = useState<Record<string, string>>({});
  const [outdatedResult, setOutdatedResult] = useState<OutdatedResult>(EMPTY_OUTDATED);
  const [installedReady, setInstalledReady] = useState(false);
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

  return (
    <div className="app-layout">
      <main className="app-main">
        <PackageList
          activeTab={activeTab}
          brewInstalled={brewInstalled}
          installedVersions={installedVersions}
          outdatedResult={outdatedResult}
          installedReady={installedReady}
          onRefreshInstalled={loadInstalledData}
          llmConfig={llmConfig}
          apiKey={apiKey}
          onOpenSettings={onOpenSettings}
        />
      </main>
    </div>
  );
}
