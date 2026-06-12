export const MODEL_SUGGESTIONS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-3.5-turbo",
  "llama3.2",
  "llama3",
  "mistral-small-latest",
  "llama-3.3-70b-versatile",
  "claude-3-5-haiku-20241022",
];

/** Cache TTL options in hours. */
export const TTL_OPTIONS = [6, 12, 24, 72, 168] as const;

export interface EndpointPreset {
  label: string;
  url: string;
  /** Default model to prefill when selecting this preset (empty = keep current). */
  model: string;
}

export const ENDPOINT_PRESETS: { local: EndpointPreset[]; remote: EndpointPreset[] } = {
  local: [
    { label: "LM Studio", url: "http://localhost:1234/v1", model: "local-model" },
    { label: "Ollama", url: "http://localhost:11434/v1", model: "llama3.2" },
  ],
  remote: [
    { label: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    { label: "Groq", url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
    { label: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "" },
    { label: "Together AI", url: "https://api.together.xyz/v1", model: "" },
    { label: "Mistral", url: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  ],
};
