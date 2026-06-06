import { useCallback, useEffect, useRef, useState } from "react";
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

export function AppLayout({ brewStatus, brewChecking }: AppLayoutProps) {
  const brewInstalled = brewStatus?.installed ?? false;
  const brewPending = brewChecking && brewStatus === null;

  const [activeTab, setActiveTab] = useState<TabId>("formulae");
  const [installedVersions, setInstalledVersions] = useState<Record<string, string>>({});
  const [outdatedResult, setOutdatedResult] = useState<OutdatedResult>(EMPTY_OUTDATED);
  const [installedReady, setInstalledReady] = useState(false);
  const loadGeneration = useRef(0);

  // Switch to Installed tab once brew is confirmed installed (only from initial formulae default).
  useEffect(() => {
    if (brewInstalled && !brewPending) {
      setActiveTab((tab) => (tab === "formulae" ? "installed" : tab));
    }
  }, [brewInstalled, brewPending]);

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

  const installedTabDisabled =
    brewPending || (brewStatus !== null && !brewStatus.installed);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-title">
          <h1>Brew Versionneer</h1>
          {brewPending && (
            <span className="brew-version brew-checking">Checking Homebrew…</span>
          )}
          {!brewPending && brewInstalled && brewStatus?.version && (
            <span className="brew-version">{brewStatus.version.split("\n")[0]}</span>
          )}
        </div>
        {!brewPending && brewStatus !== null && !brewStatus.installed && (
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
            disabled={tab.requiresBrew && installedTabDisabled}
            title={
              tab.requiresBrew && brewPending
                ? "Checking for Homebrew…"
                : tab.requiresBrew && !brewInstalled
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
          brewInstalled={brewInstalled}
          installedVersions={installedVersions}
          outdatedResult={outdatedResult}
          installedReady={installedReady}
          onRefreshInstalled={loadInstalledData}
        />
      </main>
    </div>
  );
}
