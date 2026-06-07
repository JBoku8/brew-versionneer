import { LLMConfig } from "./config";
import { PackageRecord, packageDescription, packageHomepage, packageName, packageVersion } from "./tauri";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT =
  "You are a concise assistant that helps users understand Homebrew packages. " +
  "Answer only questions about the package provided in the context. " +
  "Keep responses short (2–4 sentences unless detail is needed). " +
  "Do not speculate about information not present in the package metadata.";

/** Build the package context string sent with every request. */
function buildContext(pkg: PackageRecord): string {
  const name = packageName(pkg);
  const desc = packageDescription(pkg);
  const version = packageVersion(pkg);
  const installed =
    typeof pkg.installedVersion === "string" ? pkg.installedVersion : null;
  const latest =
    typeof pkg.latestVersion === "string" ? pkg.latestVersion : null;
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
 * Send a question about `pkg` to an OpenAI-compatible endpoint.
 * `history` is the existing chat thread (user + assistant turns).
 * Returns the assistant's reply text.
 */
export async function askAboutPackage(
  config: LLMConfig,
  apiKey: string,
  pkg: PackageRecord,
  history: ChatMessage[],
  question: string,
): Promise<string> {
  const baseUrl = config.endpoint.replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;

  const context = buildContext(pkg);
  const userContent = `${context}\n\nQuestion: ${question}`;

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    // Inject prior turns, replacing the first user turn's content with context + question
    ...history.flatMap((msg, i) => {
      if (i === 0 && msg.role === "user") {
        // First user turn already includes context from when it was sent; keep as-is
        return [msg];
      }
      return [msg];
    }),
    { role: "user", content: userContent },
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      max_tokens: 512,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("Authentication failed — check your API key in Settings.");
    }
    throw new Error(`API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from API");
  return content;
}
