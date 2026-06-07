import { LLMConfig } from "../api/config";
import { getErrorMessage, isTimeoutError } from "./errors";

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/$/, "");
}

export function buildChatCompletionsUrl(endpoint: string): string {
  return `${normalizeEndpoint(endpoint)}/chat/completions`;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

export async function testLlmConnection(
  config: Pick<LLMConfig, "endpoint" | "model">,
  apiKey = "",
): Promise<TestConnectionResult> {
  const url = buildChatCompletionsUrl(config.endpoint);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model.trim() || "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.ok || resp.status === 400) {
      return { ok: true };
    }
    if (resp.status === 401) {
      return { ok: false, error: "Authentication failed — check your API key." };
    }
    return { ok: false, error: `HTTP ${resp.status}` };
  } catch (err) {
    if (isTimeoutError(err)) {
      return { ok: false, error: "Request timed out (10 s)" };
    }
    return { ok: false, error: getErrorMessage(err, "Network error") };
  }
}
