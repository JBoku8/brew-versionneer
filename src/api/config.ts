import { invoke } from "@tauri-apps/api/core";

export interface LLMConfig {
  endpoint: string;
  model: string;
}

export interface CacheConfig {
  ttl_hours: number;
}

export interface AppConfig {
  llm: LLMConfig;
  cache: CacheConfig;
}

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  cache: {
    ttl_hours: 24,
  },
};

/** Keychain service name — matches the app bundle identifier. */
export const KEYCHAIN_SERVICE = "com.versionneer.brew";
export const KEYCHAIN_ACCOUNT = "llm-api-key";

// ── Config file (non-sensitive) ───────────────────────────────────────────────

/** Read app config from Application Support. Returns defaults if missing. */
export function readConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("read_config");
}

/** Persist app config to Application Support (does not touch the API key). */
export function writeConfig(config: AppConfig): Promise<void> {
  return invoke<void>("write_config", { config });
}

// ── Keychain (API key) ────────────────────────────────────────────────────────

/** Read a secret from the macOS Keychain. Resolves to null if not found. */
export function readKeychain(service: string, account: string): Promise<string | null> {
  return invoke<string | null>("read_keychain", { service, account });
}

/** Store a secret in the macOS Keychain. */
export function writeKeychain(service: string, account: string, secret: string): Promise<void> {
  return invoke<void>("write_keychain", { service, account, secret });
}

/** Remove a secret from the macOS Keychain. Succeeds silently if absent. */
export function deleteKeychain(service: string, account: string): Promise<void> {
  return invoke<void>("delete_keychain", { service, account });
}
