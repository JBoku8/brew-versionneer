import { THEME_KEY } from "../constants/storageKeys";

export type ThemePreference = "system" | "light" | "dark";

/**
 * Apply a theme preference to the document root element.
 *
 * - "system" → removes [data-theme]; the CSS media query takes over
 * - "light"  → sets [data-theme="light"]; suppresses dark media query
 * - "dark"   → sets [data-theme="dark"]; forces dark tokens regardless of OS
 */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/** Read the persisted theme preference from localStorage. Defaults to "system". */
export function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage unavailable in some sandboxed environments
  }
  return "system";
}

/** Persist the theme preference to localStorage. */
export function writeStoredTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage unavailable in some sandboxed environments
  }
}
