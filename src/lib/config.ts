import {
  AppConfig,
  DEFAULT_CONFIG,
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE,
  LLMConfig,
  readConfig,
  readKeychain,
} from "../api/config";

export interface LoadedAppConfig {
  config: AppConfig;
  llmConfig: LLMConfig | null;
  apiKey: string | null;
  hasApiKey: boolean;
}

export async function loadAppConfig(): Promise<LoadedAppConfig> {
  const [cfgResult, keyResult] = await Promise.allSettled([
    readConfig(),
    readKeychain(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT),
  ]);

  const config = cfgResult.status === "fulfilled" ? cfgResult.value : DEFAULT_CONFIG;
  const apiKey = keyResult.status === "fulfilled" ? keyResult.value : null;
  const llmConfig = config.llm.endpoint ? config.llm : null;

  return {
    config,
    llmConfig,
    apiKey,
    hasApiKey: !!apiKey,
  };
}
