import { useEffect, useState } from "react";
import { LLMConfig } from "../api/config";
import { loadAppConfig } from "../lib/config";

export function useAppConfig() {
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { llmConfig: llm, apiKey: key } = await loadAppConfig();
        setLlmConfig(llm);
        setApiKey(key);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return { llmConfig, apiKey, setLlmConfig, setApiKey, loading };
}
