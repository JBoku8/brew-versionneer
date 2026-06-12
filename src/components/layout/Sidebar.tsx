import { TabId } from "../../api/tauri";
import { TAB_ITEMS } from "../../constants/tabs";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CompassLogoIcon,
  GearIcon,
  RefreshIcon,
  SparkleIcon,
} from "../icons/Icon";
import { getBrewVersionLine } from "../../lib/brew";
import { AppView, BrewShellProps } from "../../models/ui";
import "./Sidebar.css";

interface SidebarProps extends Pick<BrewShellProps, "brewStatus"> {
  collapsed: boolean;
  onToggle: () => void;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  brewPending: boolean;
  onRefreshAll: () => void;
}

export function Sidebar({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  activeView,
  onViewChange,
  brewStatus,
  brewPending,
  onRefreshAll,
}: SidebarProps) {
  const brewInstalled = brewStatus?.installed ?? false;
  const brewLine = getBrewVersionLine(brewStatus);

  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"} aria-label="Navigation">
      {/* App logo */}
      <div className="sidebar-logo">
        <CompassLogoIcon size={20} className="sidebar-logo-icon" />
        {!collapsed && <span className="sidebar-logo-text">Brew Versionneer</span>}
      </div>

      {/* Package navigation */}
      <nav className="sidebar-nav" aria-label="Package views">
        {TAB_ITEMS.map((item) => {
          const disabled = !!item.requiresBrew && (brewPending || !brewInstalled);
          const isActive = activeView === "packages" && activeTab === item.id;
          const tooltip = collapsed
            ? item.label
            : disabled && brewPending
              ? "Checking for Homebrew…"
              : disabled
                ? "Install Homebrew to use this view"
                : undefined;
          return (
            <button
              key={item.id}
              type="button"
              className={["sidebar-item", isActive ? "active" : "", disabled ? "disabled" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => !disabled && onTabChange(item.id)}
              disabled={disabled}
              title={tooltip}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="sidebar-icon" aria-hidden="true">
                {item.icon}
              </span>
              {!collapsed && <span className="sidebar-label">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="sidebar-divider" role="separator" />

      {/* Actions */}
      <div className="sidebar-settings-nav">
        <button
          type="button"
          className={["sidebar-item", activeView === "assistant" ? "active" : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onViewChange("assistant")}
          title={collapsed ? "AI Assistant" : "Ask about your whole Homebrew setup"}
          aria-current={activeView === "assistant" ? "page" : undefined}
        >
          <span className="sidebar-icon"><SparkleIcon /></span>
          {!collapsed && <span className="sidebar-label">AI Assistant</span>}
        </button>
        <button
          type="button"
          className="sidebar-item"
          onClick={onRefreshAll}
          disabled={brewPending}
          title={
            collapsed ? "Refresh data" : "Re-download catalogs and reload installed packages"
          }
        >
          <span className="sidebar-icon"><RefreshIcon /></span>
          {!collapsed && <span className="sidebar-label">Refresh data</span>}
        </button>
        <button
          type="button"
          className={["sidebar-item", activeView === "settings" ? "active" : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onViewChange("settings")}
          title={collapsed ? "Settings" : undefined}
          aria-current={activeView === "settings" ? "page" : undefined}
        >
          <span className="sidebar-icon"><GearIcon /></span>
          {!collapsed && <span className="sidebar-label">Settings</span>}
        </button>
      </div>

      {/* Footer: brew version + collapse toggle */}
      <div className="sidebar-footer">
        {!collapsed &&
          (brewPending ? (
            <span className="sidebar-brew-version sidebar-brew-checking">Checking…</span>
          ) : brewLine ? (
            <span className="sidebar-brew-version" title={brewStatus?.version ?? undefined}>
              {brewLine}
            </span>
          ) : null)}
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </div>
    </aside>
  );
}
