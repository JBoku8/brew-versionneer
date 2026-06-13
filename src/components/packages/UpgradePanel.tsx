import { useEffect, useRef } from "react";
import "./UpgradePanel.css";

export type UpgradePhase = "confirm" | "running" | "done";

export type UpgradeBlocker = "password";

export interface UpgradePrompt {
  text: string;
  kind: "yesno" | "enter";
}

export interface UpgradeState {
  names: string[];
  lines: string[];
  phase: UpgradePhase;
  error: string | null;
  prompt: UpgradePrompt | null;
  blocker: UpgradeBlocker | null;
  responding: boolean;
  /** Ignore prompt patterns in log lines at or before this index. */
  promptDismissedAt: number;
}

interface UpgradePanelProps {
  upgrade: UpgradeState;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onAbort: () => void;
  onRespond: (response: string) => void;
}

export function UpgradePanel({
  upgrade,
  onClose,
  onConfirm,
  onCancel,
  onAbort,
  onRespond,
}: UpgradePanelProps) {
  const logRef = useRef<HTMLPreElement>(null);
  const isActive = upgrade.phase === "confirm" || upgrade.phase === "running";
  const canAbort = upgrade.phase === "running";

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [upgrade.lines, upgrade.prompt, upgrade.blocker]);

  const title =
    upgrade.blocker === "password"
      ? "Password required"
      : upgrade.phase === "confirm"
        ? upgrade.names.length === 1
          ? `Upgrade ${upgrade.names[0]}?`
          : `Upgrade ${upgrade.names.length} packages?`
        : upgrade.prompt
          ? "Waiting for confirmation…"
          : upgrade.phase === "running"
            ? `Upgrading ${upgrade.names.length === 1 ? upgrade.names[0] : `${upgrade.names.length} packages`}…`
            : upgrade.error
              ? "Upgrade failed"
              : "Upgrade complete";

  return (
    <div className="upgrade-panel" role="region" aria-label="Upgrade">
      <div className="upgrade-panel-header">
        <span
          className={
            upgrade.phase === "running" && !upgrade.prompt && !upgrade.blocker
              ? "upgrade-title running"
              : "upgrade-title"
          }
        >
          {upgrade.phase === "running" && !upgrade.prompt && !upgrade.blocker && (
            <span className="upgrade-spinner" aria-hidden="true" />
          )}
          {title}
        </span>
        <div className="upgrade-header-actions">
          {canAbort && (
            <button
              type="button"
              className="upgrade-abort"
              onClick={onAbort}
              title="Stop the upgrade"
            >
              Abort
            </button>
          )}
          <button
            type="button"
            className="upgrade-close"
            onClick={onClose}
            disabled={isActive}
            title={isActive ? "Wait for the upgrade to finish or abort it" : "Close"}
          >
            ✕
          </button>
        </div>
      </div>

      {upgrade.phase === "confirm" && (
        <div className="upgrade-confirm">
          <p className="upgrade-confirm-text">
            {upgrade.names.length === 1
              ? "Homebrew will upgrade this formula."
              : `Homebrew will upgrade ${upgrade.names.length} formulae:`}
          </p>
          {upgrade.names.length > 1 && (
            <ul className="upgrade-confirm-list">
              {upgrade.names.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
          <div className="upgrade-actions">
            <button type="button" className="upgrade-btn primary" onClick={onConfirm}>
              Proceed
            </button>
            <button type="button" className="upgrade-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {upgrade.blocker === "password" && upgrade.phase === "running" && (
        <div className="upgrade-blocker" role="alert">
          <p className="upgrade-blocker-text">
            Homebrew needs your macOS password (sudo). Run{" "}
            <code>brew upgrade {upgrade.names.join(" ")}</code> in Terminal, or abort here.
          </p>
          <div className="upgrade-actions">
            <button type="button" className="upgrade-btn" onClick={onAbort}>
              Abort upgrade
            </button>
          </div>
        </div>
      )}

      {upgrade.prompt && upgrade.phase === "running" && !upgrade.blocker && (
        <div className="upgrade-prompt" role="group" aria-label="Brew confirmation">
          <p className="upgrade-prompt-text">{upgrade.prompt.text}</p>
          <div className="upgrade-actions">
            {upgrade.prompt.kind === "yesno" ? (
              <>
                <button
                  type="button"
                  className="upgrade-btn primary"
                  disabled={upgrade.responding}
                  onClick={() => onRespond("y\n")}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="upgrade-btn"
                  disabled={upgrade.responding}
                  onClick={() => onRespond("n\n")}
                >
                  No
                </button>
              </>
            ) : (
              <button
                type="button"
                className="upgrade-btn primary"
                disabled={upgrade.responding}
                onClick={() => onRespond("\n")}
              >
                Continue
              </button>
            )}
          </div>
        </div>
      )}

      {upgrade.error && <div className="upgrade-error">⚠ {upgrade.error}</div>}

      {upgrade.phase !== "confirm" && (
        <pre className="upgrade-log" ref={logRef} role="log" aria-label="Upgrade output">
          {upgrade.lines.length > 0 ? upgrade.lines.join("\n") : "Starting brew upgrade…"}
        </pre>
      )}
    </div>
  );
}
