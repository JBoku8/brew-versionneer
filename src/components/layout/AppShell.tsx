import { useEffect, useState } from "react";
import { AppConfig } from "../../api/config";
import { TabId } from "../../api/tauri";
import { SIDEBAR_COLLAPSED_KEY } from "../../constants/storageKeys";
import { useAppConfig } from "../../hooks/useAppConfig";
import { deriveBrewState } from "../../lib/brew";
import { readStorageBoolean, writeStorageBoolean } from "../../lib/storage";
import { AppView, BrewShellProps } from "../../models/ui";
import { SettingsView } from "../settings";
import { AppLayout } from "./AppLayout";
import { Sidebar } from "./Sidebar";
import "./AppShell.css";

export function AppShell({ brewStatus, brewChecking }: BrewShellProps) {
  const { brewInstalled, brewPending } = deriveBrewState(brewStatus, brewChecking);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readStorageBoolean(SIDEBAR_COLLAPSED_KEY),
  );
  const [activeView, setActiveView] = useState<AppView>("packages");
  const [activeTab, setActiveTab] = useState<TabId>("formulae");
  // Incremented by the sidebar "Refresh data" button; AppLayout/PackageList react to changes.
  const [refreshToken, setRefreshToken] = useState(0);
  const { llmConfig, setLlmConfig, apiKey, setApiKey } = useAppConfig();

  // Once brew is confirmed installed, switch from the formulae default to the installed tab.
  useEffect(() => {
    if (brewInstalled && !brewPending) {
      setActiveTab((tab) => (tab === "formulae" ? "installed" : tab));
    }
  }, [brewInstalled, brewPending]);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      writeStorageBoolean(SIDEBAR_COLLAPSED_KEY, next);
      return next;
    });
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setActiveView("packages");
  };

  const handleConfigSaved = (config: AppConfig, newKey: string | null) => {
    setLlmConfig(config.llm.endpoint ? config.llm : null);
    // null = no key change; "" = key deleted (Keychain cleared); non-empty = new key
    if (newKey !== null) setApiKey(newKey || null);
  };

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={handleToggleSidebar}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        activeView={activeView}
        onViewChange={setActiveView}
        brewStatus={brewStatus}
        brewPending={brewPending}
        onRefreshAll={() => setRefreshToken((t) => t + 1)}
      />
      <div className="shell-content">
        {activeView === "settings" && <SettingsView onConfigSaved={handleConfigSaved} />}
        {/* AppLayout stays mounted while Settings is open so installed data and
            the catalog cache survive Settings round-trips (no refetch on return). */}
        <div className={activeView === "settings" ? "view-hidden" : "view-host"}>
          <AppLayout
            brewStatus={brewStatus}
            brewChecking={brewChecking}
            activeTab={activeTab}
            assistantActive={activeView === "assistant"}
            refreshToken={refreshToken}
            llmConfig={llmConfig}
            apiKey={apiKey}
            onOpenSettings={() => setActiveView("settings")}
          />
        </div>
      </div>
    </div>
  );
}
