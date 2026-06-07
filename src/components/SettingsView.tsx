import { useEffect, useRef, useState } from "react";
import {
  AppConfig,
  DEFAULT_CONFIG,
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE,
  deleteKeychain,
  readConfig,
  readKeychain,
  writeConfig,
  writeKeychain,
} from "../api/config";
import "./SettingsView.css";

const MODEL_SUGGESTIONS = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo", "llama3", "claude-3-5-haiku-20241022"];
const TTL_OPTIONS = [6, 12, 24, 72, 168]; // hours

interface SettingsViewProps {
  onConfigSaved?: (config: AppConfig, apiKey: string | null) => void;
}

type ConnectionStatus = "idle" | "testing" | "ok" | "error";

export function SettingsView({ onConfigSaved }: SettingsViewProps) {
  // Form state
  const [endpoint, setEndpoint] = useState(DEFAULT_CONFIG.llm.endpoint);
  const [model, setModel] = useState(DEFAULT_CONFIG.llm.model);
  const [ttlHours, setTtlHours] = useState(DEFAULT_CONFIG.cache.ttl_hours);
  const [apiKey, setApiKey] = useState("");
  const [keyExists, setKeyExists] = useState(false);
  const [editingKey, setEditingKey] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load config and check for existing API key on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [cfg, existingKey] = await Promise.allSettled([
          readConfig(),
          readKeychain(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT),
        ]);

        if (cfg.status === "fulfilled") {
          setEndpoint(cfg.value.llm.endpoint);
          setModel(cfg.value.llm.model);
          setTtlHours(cfg.value.cache.ttl_hours);
        }
        if (existingKey.status === "fulfilled" && existingKey.value) {
          setKeyExists(true);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const config: AppConfig = {
        llm: { endpoint: endpoint.trim(), model: model.trim() },
        cache: { ttl_hours: ttlHours },
      };
      await writeConfig(config);

      // Handle API key changes
      if (editingKey) {
        if (apiKey.trim()) {
          await writeKeychain(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, apiKey.trim());
          setKeyExists(true);
        } else {
          await deleteKeychain(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
          setKeyExists(false);
        }
        setApiKey("");
        setEditingKey(false);
      }

      // null  = key unchanged (don't touch AppShell state)
      // ""    = key explicitly deleted
      // str   = new key value just written to Keychain
      const finalKey = editingKey ? apiKey.trim() : null;
      onConfigSaved?.(config, finalKey);

      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      // Surface errors inline in the future; for now log
      console.error("Settings save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    setConnectionError(null);
    const url = endpoint.trim().replace(/\/$/, "") + "/chat/completions";
    const key = editingKey && apiKey.trim() ? apiKey.trim() : "";
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model: model.trim() || "gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.ok || resp.status === 400) {
        // 400 from OpenAI means we connected but request was invalid — still means endpoint is reachable
        setConnectionStatus("ok");
      } else if (resp.status === 401) {
        setConnectionStatus("error");
        setConnectionError("Authentication failed — check your API key.");
      } else {
        setConnectionStatus("error");
        setConnectionError(`HTTP ${resp.status}`);
      }
    } catch (err) {
      setConnectionStatus("error");
      setConnectionError(
        err instanceof DOMException && err.name === "TimeoutError"
          ? "Request timed out (10 s)"
          : err instanceof Error
            ? err.message
            : "Network error",
      );
    }
  };

  if (loading) {
    return (
      <div className="settings-view">
        <p className="settings-loading">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="settings-view">
      <h2 className="settings-title">Settings</h2>

      {/* ── AI Assistant ──────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-section-title">AI Assistant</h3>
        <p className="settings-section-desc">
          Connect any OpenAI-compatible endpoint to ask questions about packages in the detail
          panel.
        </p>

        <label className="settings-label" htmlFor="endpoint">
          API Endpoint
        </label>
        <input
          id="endpoint"
          type="url"
          className="settings-input"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://api.openai.com/v1"
          spellCheck={false}
        />

        <label className="settings-label" htmlFor="api-key">
          API Key
          <span className="settings-keychain-badge">stored in macOS Keychain</span>
        </label>
        {keyExists && !editingKey ? (
          <div className="settings-key-row">
            <span className="settings-key-masked">●●●●●●●●●●●●●●●●</span>
            <button
              type="button"
              className="settings-link-btn"
              onClick={() => setEditingKey(true)}
            >
              Update key
            </button>
          </div>
        ) : (
          <input
            id="api-key"
            type="password"
            className="settings-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keyExists ? "Enter new key (leave blank to remove)" : "Paste API key…"}
            autoComplete="off"
          />
        )}

        <label className="settings-label" htmlFor="model">
          Model
        </label>
        <input
          id="model"
          type="text"
          className="settings-input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o-mini"
          list="model-suggestions"
          spellCheck={false}
        />
        <datalist id="model-suggestions">
          {MODEL_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <div className="settings-actions">
          <button
            type="button"
            className="settings-test-btn"
            onClick={() => void handleTestConnection()}
            disabled={connectionStatus === "testing" || !endpoint.trim()}
          >
            {connectionStatus === "testing" ? "Testing…" : "Test connection"}
          </button>
          {connectionStatus === "ok" && (
            <span className="settings-connection-ok">✓ Connected</span>
          )}
          {connectionStatus === "error" && (
            <span className="settings-connection-error">✗ {connectionError}</span>
          )}
        </div>
      </section>

      {/* ── Catalog Cache ─────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-section-title">Catalog Cache</h3>
        <p className="settings-section-desc">
          Formulae and Casks catalogs are cached on disk to avoid repeated downloads.
        </p>

        <label className="settings-label" htmlFor="ttl">
          Cache TTL
        </label>
        <select
          id="ttl"
          className="settings-select"
          value={ttlHours}
          onChange={(e) => setTtlHours(Number(e.target.value))}
        >
          {TTL_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h < 24 ? `${h} hours` : h === 24 ? "24 hours (default)" : `${h / 24} days`}
            </option>
          ))}
        </select>
      </section>

      {/* ── Save bar ──────────────────────────────────── */}
      <div className="settings-save-bar">
        <button
          type="button"
          className="settings-save-btn"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="settings-saved-msg">Saved ✓</span>}
      </div>
    </div>
  );
}
