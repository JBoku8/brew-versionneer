import { useCallback, useEffect, useState } from "react";
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
  brewStatus: BrewStatus;
}

const TABS: { id: TabId; label: string; description?: string; requiresBrew?: boolean }[] = [
  { id: "installed", label: "Installed", requiresBrew: true },
  {
    id: "formulae",
    label: "Formulae",
    description: "Command-line tools and libraries distributed via Homebrew",
  },
  {
    id: "casks",
    label: "Casks",
    description: "macOS GUI applications distributed via Homebrew",
  },
];

const EMPTY_OUTDATED: OutdatedResult = { formulae: [], casks: [] };

export function AppLayout({ brewStatus }: AppLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>(
    brewStatus.installed ? "installed" : "formulae",
  );
  const [installedVersions, setInstalledVersions] = useState<Record<string, string>>({});
  const [outdatedResult, setOutdatedResult] = useState<OutdatedResult>(EMPTY_OUTDATED);
  const [installedReady, setInstalledReady] = useState(!brewStatus.installed);

  const loadInstalledData = useCallback(() => {
    if (!brewStatus.installed) {
      setInstalledReady(true);
      return;
    }
    setInstalledReady(false);

    async function load() {
      const [versionsResult, outdatedResult] = await Promise.allSettled([
        getInstalledVersions(),
        getOutdatedFormulae(),
      ]);

      if (versionsResult.status === "fulfilled") {
        setInstalledVersions(versionsResult.value);
      } else {
        // Fast command unavailable (app not rebuilt yet, or brew error) —
        // fall back to the full brew info command which was working in the MVP.
        try {
          const pkgs = await getInstalledFormulae();
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
      }

      if (outdatedResult.status === "fulfilled") {
        setOutdatedResult(outdatedResult.value);
      }
      // If getOutdatedFormulae failed, outdatedResult stays as EMPTY_OUTDATED — acceptable.
    }

    void load().finally(() => setInstalledReady(true));
  }, [brewStatus.installed]);

  useEffect(() => {
    loadInstalledData();
  }, [loadInstalledData]);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-title">
          <h1>Brew Versionneer</h1>
          {brewStatus.installed && brewStatus.version && (
            <span className="brew-version">{brewStatus.version.split("\n")[0]}</span>
          )}
        </div>
        {!brewStatus.installed && (
          <span className="brew-missing-badge">Homebrew not detected</span>
        )}
      </header>

      <nav className="app-tabs" aria-label="Package categories">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "tab active" : "tab"}
            onClick={() => setActiveTab(tab.id)}
            disabled={tab.requiresBrew && !brewStatus.installed}
            title={
              tab.requiresBrew && !brewStatus.installed
                ? "Install Homebrew to use this tab"
                : undefined
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {TABS.find((t) => t.id === activeTab)?.description && (
        <p className="tab-description">
          {TABS.find((t) => t.id === activeTab)!.description}
        </p>
      )}

      <main className="app-main">
        <PackageList
          activeTab={activeTab}
          brewInstalled={brewStatus.installed}
          installedVersions={installedVersions}
          outdatedResult={outdatedResult}
          installedReady={installedReady}
          onRefreshInstalled={loadInstalledData}
        />
      </main>
    </div>
  );
}
