import { BrewStatus, TabId } from "../api/tauri";
import "./Sidebar.css";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  activeView: "packages" | "settings";
  onViewChange: (view: "packages" | "settings") => void;
  brewStatus: BrewStatus | null;
  brewPending: boolean;
}

interface TabNavItem {
  id: TabId;
  label: string;
  icon: string;
  requiresBrew?: boolean;
}

const TAB_ITEMS: TabNavItem[] = [
  { id: "installed", label: "Installed", icon: "↓", requiresBrew: true },
  { id: "formulae", label: "Formulae", icon: "⌘" },
  { id: "casks", label: "Casks", icon: "⬜" },
];

export function Sidebar({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  activeView,
  onViewChange,
  brewStatus,
  brewPending,
}: SidebarProps) {
  const brewInstalled = brewStatus?.installed ?? false;
  const brewLine = brewStatus?.version?.split("\n")[0] ?? null;

  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"} aria-label="Navigation">
      {/* App logo */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon" aria-hidden="true">♦</span>
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
              className={[
                "sidebar-item",
                isActive ? "active" : "",
                disabled ? "disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => !disabled && onTabChange(item.id)}
              disabled={disabled}
              title={tooltip}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
              {!collapsed && <span className="sidebar-label">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="sidebar-divider" role="separator" />

      {/* Settings */}
      <div className="sidebar-settings-nav">
        <button
          type="button"
          className={["sidebar-item", activeView === "settings" ? "active" : ""].filter(Boolean).join(" ")}
          onClick={() => onViewChange("settings")}
          title={collapsed ? "Settings" : undefined}
          aria-current={activeView === "settings" ? "page" : undefined}
        >
          <span className="sidebar-icon" aria-hidden="true">⚙</span>
          {!collapsed && <span className="sidebar-label">Settings</span>}
        </button>
      </div>

      {/* Footer: brew version + collapse toggle */}
      <div className="sidebar-footer">
        {!collapsed && (brewPending ? (
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
          {collapsed ? "»" : "«"}
        </button>
      </div>
    </aside>
  );
}
