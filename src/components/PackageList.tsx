import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LLMConfig } from "../api/config";
import {
  OutdatedResult,
  PackageRecord,
  TabId,
  fetchCasksCatalog,
  fetchFormulaDetail,
  fetchFormulaeCatalog,
  packageDescription,
  packageName,
} from "../api/tauri";
import { PackageDetail } from "./PackageDetail";
import "./PackageList.css";

interface PackageListProps {
  activeTab: TabId;
  brewInstalled: boolean;
  installedVersions: Record<string, string>;
  outdatedResult: OutdatedResult;
  installedReady: boolean;
  onRefreshInstalled: () => void;
  llmConfig: LLMConfig | null;
  apiKey: string | null;
  onOpenSettings: () => void;
}

const PAGE_SIZE = 100;

export function PackageList({
  activeTab,
  brewInstalled,
  installedVersions,
  outdatedResult,
  installedReady,
  onRefreshInstalled,
  llmConfig,
  apiKey,
  onOpenSettings,
}: PackageListProps) {
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [selected, setSelected] = useState<PackageRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showOutdatedOnly, setShowOutdatedOnly] = useState(false);
  // In-memory cache for remote catalog tabs — avoids re-fetching on tab switch
  const dataCache = useRef<Partial<Record<TabId, PackageRecord[]>>>({});

  const loadPackages = useCallback(
    async (forceRefresh = false) => {
      if (activeTab === "installed") {
        if (!brewInstalled) {
          setPackages([]);
          setLoading(false);
          setError("Install Homebrew to view installed formulae.");
          return;
        }
        if (!installedReady) {
          // AppLayout is still fetching the fast brew commands; show spinner
          setLoading(true);
          setPackages([]);
          return;
        }
        const outdatedMap = new Map(outdatedResult.formulae.map((e) => [e.name, e]));
        const pkgs: PackageRecord[] = Object.entries(installedVersions)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, version]): PackageRecord => {
            const entry = outdatedMap.get(name);
            return {
              name,
              installedVersion: version,
              isOutdated: !!entry,
              latestVersion: entry?.current_version ?? version,
            };
          });
        setPackages(pkgs);
        setLoading(false);
        setError(null);
        setVisibleCount(PAGE_SIZE);
        return;
      }

      // formulae / casks — serve from in-memory cache if available
      if (!forceRefresh && dataCache.current[activeTab]) {
        setPackages(dataCache.current[activeTab]!);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setSelected(null);
      try {
        const data =
          activeTab === "formulae"
            ? await fetchFormulaeCatalog(forceRefresh)
            : await fetchCasksCatalog(forceRefresh);
        dataCache.current[activeTab] = data;
        setPackages(data);
        setVisibleCount(PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPackages([]);
      } finally {
        setLoading(false);
      }
    },
    [activeTab, brewInstalled, installedVersions, outdatedResult, installedReady],
  );

  // Reset per-tab UI state on tab switch
  useEffect(() => {
    setSearch("");
    setShowOutdatedOnly(false);
    setSelected(null);
  }, [activeTab]);

  // Load packages whenever relevant state changes (tab, installed data arriving, etc.)
  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  // Annotate catalog entries with installed/outdated status derived from AppLayout props.
  // Runs as a memo so it stays fresh whenever installedVersions or outdatedResult change,
  // without needing to invalidate the raw catalog cache.
  const annotated = useMemo(() => {
    if (activeTab === "installed") return packages;
    const outdatedSet = new Set(outdatedResult.formulae.map((e) => e.name));
    return packages.map((pkg) => {
      const name = packageName(pkg);
      const version = installedVersions[name];
      if (version !== undefined) {
        return {
          ...pkg,
          isInstalled: true,
          installedVersion: version,
          isOutdated: outdatedSet.has(name),
          latestVersion: outdatedSet.has(name)
            ? (outdatedResult.formulae.find((e) => e.name === name)?.current_version ?? version)
            : version,
        };
      }
      return pkg;
    });
  }, [packages, installedVersions, outdatedResult, activeTab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return annotated.filter((pkg) => {
      if (packageName(pkg) === "unknown") return false;
      if (showOutdatedOnly && !pkg.isOutdated) return false;
      if (!q) return true;
      const name = packageName(pkg).toLowerCase();
      const desc = packageDescription(pkg).toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [annotated, search, showOutdatedOnly]);

  const visible = filtered.slice(0, visibleCount);
  const canLoadMore = visibleCount < filtered.length;

  const outdatedCount = useMemo(
    () => annotated.filter((p) => p.isOutdated).length,
    [annotated],
  );

  const handleSelect = async (pkg: PackageRecord) => {
    setSelected(pkg);
    if (activeTab === "casks") return;

    const name = packageName(pkg);
    setDetailLoading(true);
    try {
      const detail = await fetchFormulaDetail(name);
      if (detail.length > 0) {
        setSelected({
          ...detail[0],
          // Preserve install status so detail panel can show it
          installedVersion: pkg.installedVersion,
          isOutdated: pkg.isOutdated,
          latestVersion: pkg.latestVersion,
          isInstalled: pkg.isInstalled ?? activeTab === "installed",
        });
      }
    } catch {
      // Keep list row data on detail fetch failure
    } finally {
      setDetailLoading(false);
    }
  };

  const tabLabel =
    activeTab === "installed"
      ? "Installed"
      : activeTab === "formulae"
        ? "Formulae"
        : "Casks";

  const countLabel = loading
    ? "Loading…"
    : activeTab === "installed" && installedReady
      ? outdatedCount > 0
        ? `${packages.length} installed · ${outdatedCount} outdated`
        : `${packages.length} installed`
      : `${filtered.length} packages`;

  return (
    <div className="package-browser">
      <header className="browser-toolbar">
        <input
          type="search"
          placeholder={`Search ${tabLabel.toLowerCase()}…`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          aria-label={`Search ${tabLabel}`}
        />
        <span className="browser-count">{countLabel}</span>

        {activeTab === "installed" && outdatedCount > 0 && (
          <button
            type="button"
            className={showOutdatedOnly ? "filter-btn active" : "filter-btn"}
            onClick={() => {
              setShowOutdatedOnly((v) => !v);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            {showOutdatedOnly ? "Show all" : `${outdatedCount} outdated`}
          </button>
        )}

        {activeTab !== "installed" && (
          <button
            type="button"
            className="refresh-btn"
            onClick={() => void loadPackages(true)}
            disabled={loading}
          >
            Refresh catalog
          </button>
        )}
        {activeTab === "installed" && brewInstalled && (
          <button
            type="button"
            className="refresh-btn"
            onClick={onRefreshInstalled}
            disabled={!installedReady}
          >
            Refresh
          </button>
        )}
      </header>

      {error && <div className="browser-error">{error}</div>}

      <div className="browser-panels">
        <ul className="package-list" role="listbox" aria-label={`${tabLabel} packages`}>
          {loading && packages.length === 0 && (
            <li className="list-placeholder">Loading packages…</li>
          )}
          {!loading && visible.length === 0 && (
            <li className="list-placeholder">No packages match your search.</li>
          )}
          {visible.map((pkg) => {
            const name = packageName(pkg);
            const desc = packageDescription(pkg);
            const isSelected = selected !== null && packageName(selected) === name;
            const isOutdated = pkg.isOutdated === true;
            const isInstalled = activeTab === "installed" || pkg.isInstalled === true;
            return (
              <li key={name}>
                <button
                  type="button"
                  className={isSelected ? "list-item selected" : "list-item"}
                  onClick={() => void handleSelect(pkg)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="list-item-header">
                    <span className="list-item-name">{name}</span>
                    <div className="list-item-badges">
                      {isOutdated && typeof pkg.installedVersion === "string" && (
                        <span className="badge outdated">
                          {pkg.installedVersion as string} → {typeof pkg.latestVersion === "string" ? pkg.latestVersion as string : "?"}
                        </span>
                      )}
                      {isInstalled && !isOutdated && typeof pkg.installedVersion === "string" && (
                        <span className="badge uptodate">
                          {pkg.installedVersion as string}
                        </span>
                      )}
                    </div>
                  </div>
                  {desc && <span className="list-item-desc">{desc}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {canLoadMore && (
          <button
            type="button"
            className="load-more"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        )}

        <PackageDetail
          pkg={selected}
          loading={detailLoading}
          llmConfig={llmConfig}
          apiKey={apiKey}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </div>
  );
}
