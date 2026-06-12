import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  OutdatedResult,
  PackageRecord,
  TabId,
  exportBrewfile,
  fetchCaskDetail,
  fetchCasksCatalog,
  fetchFormulaDetail,
  fetchFormulaeCatalog,
  packageDescription,
  packageName,
} from "../../api/tauri";
import { DETAIL_MIN_WIDTH, LIST_MIN_WIDTH, PAGE_SIZE } from "../../constants/layout";
import { getTabLabel } from "../../constants/tabs";
import { usePanelResize } from "../../hooks/usePanelResize";
import { getErrorMessage } from "../../lib/errors";
import {
  annotatePackages,
  buildInstalledPackageList,
  countOutdatedPackages,
  filterPackages,
  getDeprecationInfo,
  getInstalledVersionString,
  getLatestVersionString,
  isPackageOutdated,
} from "../../lib/package";
import { LlmContextProps } from "../../models/ui";
import { PackageDetail } from "./PackageDetail";
import "./PackageList.css";

interface PackageListProps extends LlmContextProps {
  activeTab: TabId;
  /** Incremented by the sidebar "Refresh data" button. */
  refreshToken: number;
  brewInstalled: boolean;
  installedVersions: Record<string, string>;
  outdatedResult: OutdatedResult;
  installedReady: boolean;
  onRefreshInstalled: () => void;
  onUpgrade: (names: string[]) => void;
  upgradeRunning: boolean;
}

const REMOTE_TABS = ["formulae", "casks"] as const;

// Module-level cache for remote catalog tabs — survives component remounts
// (e.g. Settings round-trips), so tab switches never refetch.
const catalogCache: Partial<Record<TabId, PackageRecord[]>> = {};

// Fetched formula details, keyed by name — re-selecting a package is instant.
const detailCache = new Map<string, PackageRecord>();

export function PackageList({
  activeTab,
  refreshToken,
  brewInstalled,
  installedVersions,
  outdatedResult,
  installedReady,
  onRefreshInstalled,
  onUpgrade,
  upgradeRunning,
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
  const [brewfileStatus, setBrewfileStatus] = useState<"idle" | "working" | "copied">("idle");
  const { panelsRef, detailWidth, isResizing, handleResizeStart } = usePanelResize();

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
        setPackages(buildInstalledPackageList(installedVersions));
        setLoading(false);
        setError(null);
        setVisibleCount(PAGE_SIZE);
        return;
      }

      // formulae / casks — serve from in-memory cache if available
      const cached = catalogCache[activeTab];
      if (!forceRefresh && cached) {
        setPackages(cached);
        setLoading(false);
        setError(null);
        setVisibleCount(PAGE_SIZE);
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
        catalogCache[activeTab] = data;
        setPackages(data);
        setVisibleCount(PAGE_SIZE);
      } catch (err) {
        setError(getErrorMessage(err));
        setPackages([]);
      } finally {
        setLoading(false);
      }
    },
    [activeTab, brewInstalled, installedVersions, installedReady],
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

  // Sidebar "Refresh data": drop all cached catalogs, force-refetch the active
  // remote tab now and the remaining ones in the background.
  const lastRefreshToken = useRef(refreshToken);
  useEffect(() => {
    if (refreshToken === lastRefreshToken.current) return;
    lastRefreshToken.current = refreshToken;

    for (const tab of REMOTE_TABS) delete catalogCache[tab];
    detailCache.clear();
    if (activeTab !== "installed") {
      void loadPackages(true);
    }

    const backgroundTabs = REMOTE_TABS.filter((tab) => tab !== activeTab);
    void (async () => {
      for (const tab of backgroundTabs) {
        try {
          catalogCache[tab] =
            tab === "formulae" ? await fetchFormulaeCatalog(true) : await fetchCasksCatalog(true);
        } catch {
          // Next visit to the tab retries via the normal load path.
        }
      }
    })();
  }, [refreshToken, activeTab, loadPackages]);

  const annotated = useMemo(
    () => annotatePackages(packages, installedVersions, outdatedResult, activeTab),
    [packages, installedVersions, outdatedResult, activeTab],
  );

  // Defer filtering so typing stays responsive over large catalogs.
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(
    () => filterPackages(annotated, deferredSearch, showOutdatedOnly),
    [annotated, deferredSearch, showOutdatedOnly],
  );

  const visible = filtered.slice(0, visibleCount);
  const canLoadMore = visibleCount < filtered.length;
  const outdatedCount = useMemo(() => countOutdatedPackages(annotated), [annotated]);
  const outdatedNames = useMemo(
    () => outdatedResult.formulae.map((e) => e.name),
    [outdatedResult],
  );

  const handleExportBrewfile = async () => {
    setBrewfileStatus("working");
    try {
      const contents = await exportBrewfile();
      await navigator.clipboard.writeText(contents);
      setBrewfileStatus("copied");
      setTimeout(() => setBrewfileStatus("idle"), 2500);
    } catch (err) {
      setBrewfileStatus("idle");
      setError(getErrorMessage(err));
    }
  };

  const selectGeneration = useRef(0);

  const handleSelect = async (pkg: PackageRecord) => {
    setSelected(pkg);

    const name = packageName(pkg);
    const isCask = activeTab === "casks";
    // Cask tokens can collide with formula names — namespace the cache key.
    const cacheKey = `${isCask ? "cask" : "formula"}:${name}`;
    const generation = ++selectGeneration.current;

    const applyDetail = (detail: PackageRecord) => {
      setSelected({
        ...detail,
        // Preserve install status so detail panel can show it
        installedVersion: pkg.installedVersion,
        isOutdated: pkg.isOutdated,
        latestVersion: pkg.latestVersion,
        isInstalled: pkg.isInstalled ?? activeTab === "installed",
      });
    };

    const cached = detailCache.get(cacheKey);
    if (cached) {
      applyDetail(cached);
      return;
    }

    setDetailLoading(true);
    try {
      const detail = isCask ? await fetchCaskDetail(name) : await fetchFormulaDetail(name);
      // A newer selection happened while this fetch was in flight — drop it.
      if (generation !== selectGeneration.current) return;
      if (detail.length > 0) {
        detailCache.set(cacheKey, detail[0]);
        applyDetail(detail[0]);
      }
    } catch {
      // Keep list row data on detail fetch failure
    } finally {
      if (generation === selectGeneration.current) setDetailLoading(false);
    }
  };

  const tabLabel = getTabLabel(activeTab);

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

        {activeTab === "installed" && outdatedNames.length > 0 && (
          <button
            type="button"
            className="upgrade-all-btn"
            onClick={() => onUpgrade(outdatedNames)}
            disabled={upgradeRunning || !installedReady}
            title={`brew upgrade ${outdatedNames.join(" ")}`}
          >
            {upgradeRunning ? "Upgrading…" : `Upgrade all (${outdatedNames.length})`}
          </button>
        )}

        {activeTab === "installed" && brewInstalled && (
          <button
            type="button"
            className="refresh-btn"
            onClick={() => void handleExportBrewfile()}
            disabled={brewfileStatus === "working"}
            title="Generate a Brewfile from your installation and copy it to the clipboard"
          >
            {brewfileStatus === "copied"
              ? "Copied ✓"
              : brewfileStatus === "working"
                ? "Exporting…"
                : "Export Brewfile"}
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

      <div className="browser-panels" ref={panelsRef}>
        <div className="list-column" style={{ minWidth: LIST_MIN_WIDTH }}>
          {canLoadMore && (
            <button
              type="button"
              className="load-more"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            >
              Load more ({filtered.length - visibleCount} remaining)
            </button>
          )}
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
              const isOutdated = isPackageOutdated(pkg);
              const installedVersion = getInstalledVersionString(pkg);
              const latestVersion = getLatestVersionString(pkg);
              const isInstalled = activeTab === "installed" || pkg.isInstalled === true;
              const deprecation = getDeprecationInfo(pkg);
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
                        {deprecation && (
                          <span className="badge deprecated" title={deprecation.reason ?? undefined}>
                            {deprecation.label}
                          </span>
                        )}
                        {isOutdated && installedVersion && (
                          <span className="badge outdated">
                            {installedVersion} → {latestVersion ?? "?"}
                          </span>
                        )}
                        {isInstalled && !isOutdated && installedVersion && (
                          <span className="badge uptodate">{installedVersion}</span>
                        )}
                      </div>
                    </div>
                    {desc && <span className="list-item-desc">{desc}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div
          className={isResizing ? "column-resize-handle active" : "column-resize-handle"}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize list and detail panels"
          onMouseDown={handleResizeStart}
        />

        <div className="detail-column" style={{ width: detailWidth, minWidth: DETAIL_MIN_WIDTH }}>
          <PackageDetail
            pkg={selected}
            loading={detailLoading}
            onUpgrade={onUpgrade}
            upgradeRunning={upgradeRunning}
            llmConfig={llmConfig}
            apiKey={apiKey}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </div>
    </div>
  );
}
