import { Channel, invoke } from "@tauri-apps/api/core";

export interface BrewStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
}

export type PackageRecord = Record<string, unknown>;

export type TabId = "installed" | "formulae" | "casks";

export interface OutdatedEntry {
  name: string;
  installed_versions: string[];
  current_version: string;
  pinned: boolean;
}

export interface OutdatedResult {
  formulae: OutdatedEntry[];
  casks: OutdatedEntry[];
}

export function checkBrew(): Promise<BrewStatus> {
  return invoke<BrewStatus>("check_brew");
}

/** Fast path: filesystem lookup only (~1ms), no `brew --version`. */
export function detectBrew(): Promise<BrewStatus> {
  return invoke<BrewStatus>("detect_brew");
}

export function getBrewVersion(): Promise<string | null> {
  return invoke<string | null>("get_brew_version");
}

export function getInstalledFormulae(): Promise<PackageRecord[]> {
  return invoke<unknown>("get_installed_formulae").then(normalizePackageList);
}

export function fetchFormulaeCatalog(forceRefresh = false): Promise<PackageRecord[]> {
  return invoke<unknown>("fetch_formulae_catalog", { forceRefresh }).then(normalizePackageList);
}

export function fetchCasksCatalog(forceRefresh = false): Promise<PackageRecord[]> {
  return invoke<unknown>("fetch_casks_catalog", { forceRefresh }).then(normalizePackageList);
}

export function fetchFormulaDetail(name: string): Promise<PackageRecord[]> {
  return invoke<unknown>("fetch_formula_detail", { name }).then(normalizePackageList);
}

export function fetchCaskDetail(token: string): Promise<PackageRecord[]> {
  return invoke<unknown>("fetch_cask_detail", { token }).then(normalizePackageList);
}

/** Returns a {name: installedVersion} map (~100ms, much faster than getInstalledFormulae). */
export function getInstalledVersions(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("get_installed_versions");
}

/** Returns outdated formulae + casks (~300ms via `brew outdated --json=v2`). */
export function getOutdatedFormulae(): Promise<OutdatedResult> {
  return invoke<OutdatedResult>("get_outdated_formulae");
}

/** Runs `brew upgrade <names…>`, invoking `onLine` for each output line. */
export function upgradePackages(names: string[], onLine: (line: string) => void): Promise<void> {
  const onOutput = new Channel<string>();
  onOutput.onmessage = onLine;
  return invoke<void>("upgrade_packages", { names, onOutput });
}

/** Returns the contents of a Brewfile generated from the current installation. */
export function exportBrewfile(): Promise<string> {
  return invoke<string>("export_brewfile");
}

/** Update the menu-bar tray title/tooltip with the outdated count. */
export function updateTrayCount(outdated: number): Promise<void> {
  return invoke<void>("update_tray_count", { outdated });
}

function normalizePackageList(data: unknown): PackageRecord[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }
  if (isRecord(data)) {
    return [data];
  }
  return [];
}

function isRecord(value: unknown): value is PackageRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function packageName(pkg: PackageRecord): string {
  // Formulae: `name` is a string. Casks: `name` is an array of display names
  // and `token` is the identifier — fall through to token there.
  if (typeof pkg.name === "string") return pkg.name;
  if (typeof pkg.token === "string") return pkg.token;
  return "unknown";
}

export function packageDescription(pkg: PackageRecord): string {
  const desc = pkg.desc ?? pkg.description;
  if (typeof desc === "string") return desc;
  if (Array.isArray(desc)) return desc.filter((d) => typeof d === "string").join(" ");
  return "";
}

export function packageHomepage(pkg: PackageRecord): string | null {
  const homepage = pkg.homepage;
  if (typeof homepage === "string") return homepage;
  if (Array.isArray(homepage) && typeof homepage[0] === "string") {
    return homepage[0];
  }
  return null;
}

export function packageVersion(pkg: PackageRecord): string | null {
  const versions = pkg.versions;
  if (isRecord(versions)) {
    const stable = versions.stable;
    if (typeof stable === "string") return stable;
  }
  // Casks carry a top-level `version` string instead of `versions.stable`
  if (typeof pkg.version === "string") return pkg.version;
  const installed = pkg.installed;
  if (Array.isArray(installed) && installed.length > 0) {
    const first = installed[0];
    if (isRecord(first) && typeof first.version === "string") {
      return first.version;
    }
  }
  // Fast-loaded installed packages only have installedVersion
  if (typeof pkg.installedVersion === "string") return pkg.installedVersion;
  return null;
}
