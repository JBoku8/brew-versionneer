import { LLMConfig } from "./config";
import { buildChatCompletionsUrl } from "../lib/llm";
import { getInstalledVersionString, getLatestVersionString } from "../lib/package";
import {
  OutdatedResult,
  PackageRecord,
  packageDescription,
  packageHomepage,
  packageName,
  packageVersion,
} from "./tauri";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT =
  "You are a concise assistant that helps users understand Homebrew packages. " +
  "Answer only questions about the package provided in the context. " +
  "Do not speculate about information not present in the package metadata. " +
  "Format your response in Markdown: use ## headers to separate topics, bullet lists for multiple items, " +
  "and `inline code` for package names and brew commands. Avoid tables.";

/** Build the package context string sent with every request. */
function buildContext(pkg: PackageRecord): string {
  const name = packageName(pkg);
  const desc = packageDescription(pkg);
  const version = packageVersion(pkg);
  const installed = getInstalledVersionString(pkg);
  const latest = getLatestVersionString(pkg);
  const tap = typeof pkg.tap === "string" ? pkg.tap : null;
  const homepage = packageHomepage(pkg);

  const lines = [`Package: ${name}`];
  if (desc) lines.push(`Description: ${desc}`);
  if (installed) lines.push(`Installed version: ${installed}`);
  if (latest && latest !== installed) lines.push(`Latest version: ${latest}`);
  else if (version && !installed) lines.push(`Version: ${version}`);
  if (tap) lines.push(`Tap: ${tap}`);
  if (homepage) lines.push(`Homepage: ${homepage}`);

  return lines.join("\n");
}

/**
 * Send a question about `pkg` to an OpenAI-compatible endpoint, streaming the
 * reply. `history` is the existing chat thread (user + assistant turns).
 * `onDelta` receives the accumulated reply text as tokens arrive.
 * Returns the full assistant reply.
 */
export async function askAboutPackage(
  config: LLMConfig,
  apiKey: string,
  pkg: PackageRecord,
  history: ChatMessage[],
  question: string,
  onDelta?: (text: string) => void,
): Promise<string> {
  // Package context lives in the system message — sent once, not per turn.
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${buildContext(pkg)}` },
    ...history,
    { role: "user", content: question },
  ];
  return chatCompletion(config, apiKey, messages, onDelta);
}

const SETUP_SYSTEM_PROMPT =
  "You are a Homebrew expert helping the user manage their installed packages. " +
  "Use the provided inventory to answer questions about upgrades, cleanup, redundancy, " +
  "and tool recommendations. Be concise and practical. " +
  "If asked about a package not in the inventory, say it is not installed. " +
  "Format your response in Markdown: use ## headers to group by topic or category, " +
  "bullet lists for items within each group, and `inline code` for package names and brew commands. " +
  "Never use tables — always use bullet lists instead.";

const SETUP_CONTEXT_MAX_ENTRIES = 300;

/** Build a context block describing the user's whole Homebrew installation. */
function buildSetupContext(
  installedVersions: Record<string, string>,
  outdatedResult: OutdatedResult,
): string {
  const entries = Object.entries(installedVersions).sort(([a], [b]) => a.localeCompare(b));
  const listed = entries
    .slice(0, SETUP_CONTEXT_MAX_ENTRIES)
    .map(([name, version]) => `${name} ${version}`)
    .join("\n");
  const more =
    entries.length > SETUP_CONTEXT_MAX_ENTRIES
      ? `\n(and ${entries.length - SETUP_CONTEXT_MAX_ENTRIES} more)`
      : "";
  const outdated =
    outdatedResult.formulae
      .map(
        (e) =>
          `${e.name} ${e.installed_versions.join(", ")} -> ${e.current_version}` +
          (e.pinned ? " (pinned)" : ""),
      )
      .join("\n") || "none";

  return `Installed formulae (${entries.length}):\n${listed}${more}\n\nOutdated:\n${outdated}`;
}

/**
 * Ask a question about the user's whole Homebrew setup (installed + outdated
 * packages are provided as context). Streams via `onDelta` like askAboutPackage.
 */
export async function askAboutSetup(
  config: LLMConfig,
  apiKey: string,
  installedVersions: Record<string, string>,
  outdatedResult: OutdatedResult,
  history: ChatMessage[],
  question: string,
  onDelta?: (text: string) => void,
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: `${SETUP_SYSTEM_PROMPT}\n\n${buildSetupContext(installedVersions, outdatedResult)}`,
    },
    ...history,
    { role: "user", content: question },
  ];
  return chatCompletion(config, apiKey, messages, onDelta);
}

/** Shared OpenAI-compatible chat-completions call with streaming + JSON fallback. */
async function chatCompletion(
  config: LLMConfig,
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  onDelta?: (text: string) => void,
): Promise<string> {
  const url = buildChatCompletionsUrl(config.endpoint);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication failed — check your API key in Settings.");
    }
    throw new Error(`API error ${response.status} — check your endpoint and model in Settings.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    // Server ignored `stream: true` and sent a regular completion.
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from API");
    onDelta?.(content);
    return content;
  }

  return readSseStream(response, onDelta);
}

/** Accumulate an OpenAI-style SSE stream (`data: {...}` frames) into the reply text. */
async function readSseStream(
  response: Response,
  onDelta?: (text: string) => void,
): Promise<string> {
  if (!response.body) throw new Error("Empty response from API");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  // Returns true when the [DONE] sentinel is seen.
  const processFrame = (line: string): boolean => {
    const frame = line.trim();
    if (!frame.startsWith("data:")) return false;
    const payload = frame.slice(5).trim();
    if (payload === "[DONE]") return true;
    try {
      const parsed = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        onDelta?.(full);
      }
    } catch {
      // Tolerate keep-alive comments and non-JSON frames.
    }
    return false;
  };

  let finished = false;
  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (processFrame(line)) {
        finished = true;
        break;
      }
    }
  }

  // Flush a final frame that arrived without a trailing newline.
  if (!finished) {
    buffer += decoder.decode();
    processFrame(buffer);
  }

  if (!full) throw new Error("Empty response from API");
  return full;
}
