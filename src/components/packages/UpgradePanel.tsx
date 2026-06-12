import { useEffect, useRef } from "react";
import "./UpgradePanel.css";

export interface UpgradeState {
  names: string[];
  lines: string[];
  running: boolean;
  error: string | null;
}

interface UpgradePanelProps {
  upgrade: UpgradeState;
  onClose: () => void;
}

export function UpgradePanel({ upgrade, onClose }: UpgradePanelProps) {
  const logRef = useRef<HTMLPreElement>(null);

  // Follow the log as new lines stream in
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [upgrade.lines]);

  const title = upgrade.running
    ? `Upgrading ${upgrade.names.length === 1 ? upgrade.names[0] : `${upgrade.names.length} packages`}…`
    : upgrade.error
      ? "Upgrade failed"
      : "Upgrade complete";

  return (
    <div className="upgrade-panel" role="log" aria-label="Upgrade output">
      <div className="upgrade-panel-header">
        <span className={upgrade.running ? "upgrade-title running" : "upgrade-title"}>
          {upgrade.running && <span className="upgrade-spinner" aria-hidden="true" />}
          {title}
        </span>
        <button
          type="button"
          className="upgrade-close"
          onClick={onClose}
          disabled={upgrade.running}
          title={upgrade.running ? "Wait for the upgrade to finish" : "Close"}
        >
          ✕
        </button>
      </div>
      {upgrade.error && <div className="upgrade-error">⚠ {upgrade.error}</div>}
      <pre className="upgrade-log" ref={logRef}>
        {upgrade.lines.length > 0 ? upgrade.lines.join("\n") : "Starting brew upgrade…"}
      </pre>
    </div>
  );
}
