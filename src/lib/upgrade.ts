export type UpgradePromptKind = "yesno" | "enter";

export type UpgradeBlocker = "password";

export interface UpgradePrompt {
  text: string;
  kind: UpgradePromptKind;
}

/** Lines that indicate brew is waiting for a password — not handled in-app. */
export function isPasswordPrompt(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes("password for") ||
    /password:\s*$/.test(lower) ||
    lower.includes("sudo password")
  );
}

/**
 * Detect whether a streamed brew line is an interactive prompt we can answer
 * from the upgrade panel. Returns null for sudo/password prompts.
 */
export function detectUpgradePrompt(line: string): UpgradePrompt | null {
  const trimmed = line.trim();
  if (!trimmed || isPasswordPrompt(trimmed)) return null;

  if (/press return|press enter/i.test(trimmed)) {
    return { text: trimmed, kind: "enter" };
  }

  if (
    /do you want to proceed/i.test(trimmed) ||
    /\[(y\/n|Y\/n|y\/N)\]/i.test(trimmed) ||
    /\(y\/n\)/i.test(trimmed) ||
    /\[yes\/no\]/i.test(trimmed)
  ) {
    return { text: trimmed, kind: "yesno" };
  }

  return null;
}

/** Scan recent log tail — brew sometimes splits prompts across lines. */
export function detectUpgradePromptFromLines(lines: string[]): UpgradePrompt | null {
  const start = Math.max(0, lines.length - 4);
  for (let i = lines.length - 1; i >= start; i--) {
    const prompt = detectUpgradePrompt(lines[i]!);
    if (prompt) return prompt;
  }
  return null;
}

/** Detect blockers that cannot be answered from the panel (sudo/password). */
export function detectUpgradeBlocker(line: string): UpgradeBlocker | null {
  return isPasswordPrompt(line) ? "password" : null;
}

export function detectUpgradeBlockerFromLines(lines: string[]): UpgradeBlocker | null {
  const start = Math.max(0, lines.length - 4);
  for (let i = lines.length - 1; i >= start; i--) {
    const blocker = detectUpgradeBlocker(lines[i]!);
    if (blocker) return blocker;
  }
  return null;
}
