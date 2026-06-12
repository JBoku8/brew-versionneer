import {
  OutdatedResult,
  PackageRecord,
  TabId,
  packageDescription,
  packageName,
} from "../api/tauri";

export function formatLicense(license: unknown): string | null {
  if (typeof license === "string") return license;
  if (Array.isArray(license)) {
    return license.map(String).join(", ");
  }
  return null;
}

export function getInstalledVersionString(pkg: PackageRecord): string | null {
  return typeof pkg.installedVersion === "string" ? pkg.installedVersion : null;
}

export function getLatestVersionString(pkg: PackageRecord): string | null {
  return typeof pkg.latestVersion === "string" ? pkg.latestVersion : null;
}

export function isPackageOutdated(pkg: PackageRecord): boolean {
  return pkg.isOutdated === true;
}

export interface DeprecationInfo {
  label: "deprecated" | "disabled";
  reason: string | null;
}

/** Deprecation/disable status from the brew catalog. Disabled wins over deprecated. */
export function getDeprecationInfo(pkg: PackageRecord): DeprecationInfo | null {
  if (pkg.disabled === true) {
    return {
      label: "disabled",
      reason: typeof pkg.disable_reason === "string" ? pkg.disable_reason : null,
    };
  }
  if (pkg.deprecated === true) {
    return {
      label: "deprecated",
      reason: typeof pkg.deprecation_reason === "string" ? pkg.deprecation_reason : null,
    };
  }
  return null;
}

export function buildInstalledPackageList(
  installedVersions: Record<string, string>,
): PackageRecord[] {
  return Object.entries(installedVersions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, version]): PackageRecord => ({
        name,
        installedVersion: version,
      }),
    );
}

export function annotatePackages(
  packages: PackageRecord[],
  installedVersions: Record<string, string>,
  outdatedResult: OutdatedResult,
  activeTab: TabId,
): PackageRecord[] {
  const outdatedMap = new Map(outdatedResult.formulae.map((e) => [e.name, e]));

  if (activeTab === "installed") {
    return packages.map((pkg) => {
      const name = packageName(pkg);
      const version = getInstalledVersionString(pkg) ?? installedVersions[name];
      const entry = outdatedMap.get(name);
      return {
        ...pkg,
        installedVersion: version,
        isOutdated: !!entry,
        latestVersion: entry?.current_version ?? version,
      };
    });
  }

  return packages.map((pkg) => {
    const name = packageName(pkg);
    const version = installedVersions[name];
    if (version === undefined) return pkg;

    const entry = outdatedMap.get(name);
    return {
      ...pkg,
      isInstalled: true,
      installedVersion: version,
      isOutdated: !!entry,
      latestVersion: entry?.current_version ?? version,
    };
  });
}

export function filterPackages(
  packages: PackageRecord[],
  search: string,
  showOutdatedOnly: boolean,
): PackageRecord[] {
  const q = search.trim().toLowerCase();
  return packages.filter((pkg) => {
    if (packageName(pkg) === "unknown") return false;
    if (showOutdatedOnly && !isPackageOutdated(pkg)) return false;
    if (!q) return true;
    const name = packageName(pkg).toLowerCase();
    const desc = packageDescription(pkg).toLowerCase();
    return name.includes(q) || desc.includes(q);
  });
}

export function countOutdatedPackages(packages: PackageRecord[]): number {
  return packages.filter((p) => isPackageOutdated(p)).length;
}
