import { useEffect, useState } from "react";
import {
  AppConfig,
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE,
  LLMConfig,
  readConfig,
  readKeychain,
} from "../api/config";
import { BrewStatus, TabId } from "../api/tauri";
import { AppLayout } from "./AppLayout";
import { SettingsView } from "./SettingsView";
import { Sidebar } from "./Sidebar";
import "./AppShell.css";

interface AppShellProps {
  brewStatus: BrewStatus | null;
  brewChecking: boolean;
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem("sidebar-collapsed") === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem("sidebar-collapsed", String(value));
  } catch {
    // localStorage unavailable in some sandboxed environments
  }
}

export function AppShell({ brewStatus, brewChecking }: AppShellProps) {
  const brewInstalled = brewStatus?.installed ?? false;
  const brewPending = brewChecking && brewStatus === null;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);
  const [activeView, setActiveView] = useState<"packages" | "settings">("packages");
  const [activeTab, setActiveTab] = useState<TabId>("formulae");

  // LLM config lifted here so both SettingsView (write) and PackageDetail (read) can access it
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Load config + API key on mount
  useEffect(() => {
    async function load() {
      const [cfgResult, keyResult] = await Promise.allSettled([
        readConfig(),
        readKeychain(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT),
      ]);
      if (cfgResult.status === "fulfilled") {
        const { llm } = cfgResult.value;
        if (llm.endpoint) setLlmConfig(llm);
      }
      if (keyResult.status === "fulfilled") {
        setApiKey(keyResult.value);
      }
    }
    void load();
  }, []);

  // Once brew is confirmed installed, switch from the formulae default to the installed tab.
  useEffect(() => {
    if (brewInstalled && !brewPending) {
      setActiveTab((tab) => (tab === "formulae" ? "installed" : tab));
    }
  }, [brewInstalled, brewPending]);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
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
      />
      <div className="shell-content">
        {activeView === "settings" ? (
          <SettingsView onConfigSaved={handleConfigSaved} />
        ) : (
          <AppLayout
            brewStatus={brewStatus}
            brewChecking={brewChecking}
            activeTab={activeTab}
            llmConfig={llmConfig}
            apiKey={apiKey}
            onOpenSettings={() => setActiveView("settings")}
          />
        )}
      </div>
    </div>
  );
}
