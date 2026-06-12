import {
  PackageRecord,
  packageDescription,
  packageHomepage,
  packageName,
  packageVersion,
} from "../../api/tauri";
import {
  formatLicense,
  getDeprecationInfo,
  getInstalledVersionString,
  getLatestVersionString,
  isPackageOutdated,
} from "../../lib/package";
import { LlmContextProps } from "../../models/ui";
import { AISection } from "./AISection";
import "./PackageDetail.css";

interface PackageDetailProps extends LlmContextProps {
  pkg: PackageRecord | null;
  loading?: boolean;
  onUpgrade: (names: string[]) => void;
  upgradeRunning: boolean;
}

export function PackageDetail({
  pkg,
  loading,
  onUpgrade,
  upgradeRunning,
  llmConfig,
  apiKey,
  onOpenSettings,
}: PackageDetailProps) {
  if (loading) {
    return (
      <aside className="package-detail">
        <p className="detail-placeholder">Loading details…</p>
      </aside>
    );
  }

  if (!pkg) {
    return (
      <aside className="package-detail">
        <p className="detail-placeholder">Select a package to view details.</p>
      </aside>
    );
  }

  const name = packageName(pkg);
  const desc = packageDescription(pkg);
  const homepage = packageHomepage(pkg);
  const version = packageVersion(pkg);
  const tap = typeof pkg.tap === "string" ? pkg.tap : null;
  const license = formatLicense(pkg.license);

  const installedVersion = getInstalledVersionString(pkg);
  const latestVersion = getLatestVersionString(pkg);
  const isOutdated = isPackageOutdated(pkg);
  const deprecation = getDeprecationInfo(pkg);

  return (
    <aside className="package-detail">
      <h2>{name}</h2>
      {deprecation && (
        <p className="detail-deprecation">
          ⚠ This package is {deprecation.label}
          {deprecation.reason ? ` — ${deprecation.reason}` : ""}
        </p>
      )}
      {installedVersion && !isOutdated && (
        <p className="detail-version detail-installed">Installed: {installedVersion}</p>
      )}
      {isOutdated && installedVersion && latestVersion && (
        <p className="detail-version detail-outdated">
          Update available: {installedVersion} → {latestVersion}
          <button
            type="button"
            className="detail-upgrade-btn"
            onClick={() => onUpgrade([name])}
            disabled={upgradeRunning}
            title={`brew upgrade ${name}`}
          >
            {upgradeRunning ? "Upgrading…" : "Upgrade"}
          </button>
        </p>
      )}
      {version && !installedVersion && <p className="detail-version">Version: {version}</p>}
      {tap && <p className="detail-meta">Tap: {tap}</p>}
      {desc && <p className="detail-desc">{desc}</p>}
      {license && <p className="detail-meta">License: {license}</p>}
      {homepage && (
        <p>
          <a href={homepage} target="_blank" rel="noreferrer">
            Homepage
          </a>
        </p>
      )}
      <details className="detail-raw">
        <summary>Raw JSON</summary>
        <pre>{JSON.stringify(pkg, null, 2)}</pre>
      </details>

      <AISection pkg={pkg} llmConfig={llmConfig} apiKey={apiKey} onOpenSettings={onOpenSettings} />
    </aside>
  );
}
