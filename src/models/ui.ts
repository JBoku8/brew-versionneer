import { LLMConfig } from "../api/config";
import { BrewStatus, TabId } from "../api/tauri";

export type AppView = "packages" | "assistant" | "settings";

export type ConnectionStatus = "idle" | "testing" | "ok" | "error";

export interface TabNavItem {
  id: TabId;
  label: string;
  icon: string;
  requiresBrew?: boolean;
}

export interface LlmContextProps {
  llmConfig: LLMConfig | null;
  apiKey: string | null;
  onOpenSettings: () => void;
}

export interface BrewShellProps {
  brewStatus: BrewStatus | null;
  brewChecking: boolean;
}
