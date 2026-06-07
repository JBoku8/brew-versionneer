import { ReactNode, createContext, useContext, useState } from "react";
import { ThemePreference, applyTheme, readStoredTheme, writeStoredTheme } from "../lib/theme";

interface ThemeContextValue {
  /** The currently active theme preference. */
  theme: ThemePreference;
  /**
   * Change the theme preference. Applies immediately to the DOM,
   * persists to localStorage, and updates React state.
   */
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Provides theme state to the entire component tree.
 * Wrap the root of the app with this component.
 *
 * Note: `applyTheme(readStoredTheme())` is also called synchronously in
 * main.tsx before React mounts to prevent a flash of the wrong theme.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme);

  const setTheme = (newTheme: ThemePreference) => {
    applyTheme(newTheme);
    writeStoredTheme(newTheme);
    setThemeState(newTheme);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

/**
 * Read and update the current theme preference from anywhere in the tree.
 *
 * @example
 * const { theme, setTheme } = useTheme();
 * setTheme("dark"); // applies immediately, persists across restarts
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
