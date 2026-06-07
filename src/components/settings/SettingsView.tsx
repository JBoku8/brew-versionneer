import { useEffect, useRef, useState } from "react";
import {
  AppConfig,
  DEFAULT_CONFIG,
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE,
  deleteKeychain,
  writeConfig,
  writeKeychain,
} from "../../api/config";
import { useTheme } from "../../contexts/ThemeContext";
import { MODEL_SUGGESTIONS, TTL_OPTIONS } from "../../constants/settings";
import { loadAppConfig } from "../../lib/config";
import { testLlmConnection } from "../../lib/llm";
import { ThemePreference } from "../../lib/theme";
import { ConnectionStatus } from "../../models/ui";
import "./SettingsView.css";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

interface SettingsViewProps {
  onConfigSaved?: (config: AppConfig, apiKey: string | null) => void;
}

export function SettingsView({ onConfigSaved }: SettingsViewProps) {
  const { theme, setTheme } = useTheme();
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

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { config, hasApiKey } = await loadAppConfig();
        setEndpoint(config.llm.endpoint);
        setModel(config.llm.model);
        setTtlHours(config.cache.ttl_hours);
        setKeyExists(hasApiKey);
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
    const key = editingKey && apiKey.trim() ? apiKey.trim() : "";
    const result = await testLlmConnection({ endpoint, model }, key);
    if (result.ok) {
      setConnectionStatus("ok");
    } else {
      setConnectionStatus("error");
      setConnectionError(result.error ?? "Connection failed");
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

      {/* ── Appearance ────────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-section-title">Appearance</h3>
        <p className="settings-section-desc">
          Choose how the app looks. "System" follows your macOS appearance setting.
        </p>
        <div className="settings-theme-picker" role="group" aria-label="Color theme">
          {THEME_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`settings-theme-btn${theme === value ? " active" : ""}`}
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

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
            <button type="button" className="settings-link-btn" onClick={() => setEditingKey(true)}>
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
          {connectionStatus === "ok" && <span className="settings-connection-ok">✓ Connected</span>}
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
