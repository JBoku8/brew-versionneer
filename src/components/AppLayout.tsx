import { useCallback, useEffect, useRef, useState } from "react";
import { LLMConfig } from "../api/config";
import {
  BrewStatus,
  OutdatedResult,
  TabId,
  getInstalledFormulae,
  getInstalledVersions,
  getOutdatedFormulae,
  packageName,
  packageVersion,
} from "../api/tauri";
import { PackageList } from "./PackageList";
import "./AppLayout.css";

interface AppLayoutProps {
  brewStatus: BrewStatus | null;
  brewChecking: boolean;
  activeTab: TabId;
  llmConfig: LLMConfig | null;
  apiKey: string | null;
  onOpenSettings: () => void;
}

const EMPTY_OUTDATED: OutdatedResult = { formulae: [], casks: [] };

export function AppLayout({ brewStatus, brewChecking, activeTab, llmConfig, apiKey, onOpenSettings }: AppLayoutProps) {
  const brewInstalled = brewStatus?.installed ?? false;
  const brewPending = brewChecking && brewStatus === null;

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
