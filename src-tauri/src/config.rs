use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const CONFIG_FILENAME: &str = "config.json";

/// Top-level application configuration (stored in Application Support).
/// The API key is NOT here — it lives in the macOS Keychain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub llm: LLMConfig,
    pub cache: CacheConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMConfig {
    /// Base URL of an OpenAI-compatible endpoint (e.g. "https://api.openai.com/v1")
    pub endpoint: String,
    /// Model identifier (e.g. "gpt-4o-mini")
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    /// How many hours the on-disk catalog cache is considered fresh.
    pub ttl_hours: u64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            llm: LLMConfig::default(),
            cache: CacheConfig::default(),
        }
    }
}

impl Default for LLMConfig {
    fn default() -> Self {
        Self {
            endpoint: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
        }
    }
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self { ttl_hours: 24 }
    }
}

/// Read config from `<data_dir>/config.json`. Returns defaults if the file is missing or invalid.
pub fn read_config(data_dir: &Path) -> AppConfig {
    let path = data_dir.join(CONFIG_FILENAME);
    let Ok(contents) = fs::read_to_string(&path) else {
        return AppConfig::default();
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

/// Write config to `<data_dir>/config.json`.
pub fn write_config(data_dir: &Path, config: &AppConfig) -> Result<(), String> {
    if let Err(e) = fs::create_dir_all(data_dir) {
        return Err(format!("Failed to create config directory: {e}"));
    }
    let path = data_dir.join(CONFIG_FILENAME);
    let serialized =
        serde_json::to_string_pretty(config).map_err(|e| format!("Serialization error: {e}"))?;
    fs::write(&path, serialized).map_err(|e| format!("Failed to write config: {e}"))
}

// ── Keychain helpers ──────────────────────────────────────────────────────────

/// Read a secret from the macOS Keychain. Returns `None` if not found.
pub fn keychain_read(service: &str, account: &str) -> Option<String> {
    keyring::Entry::new(service, account)
        .ok()
        .and_then(|entry| entry.get_password().ok())
}

/// Store a secret in the macOS Keychain, creating or replacing the entry.
pub fn keychain_write(service: &str, account: &str, secret: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, account).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())
}

/// Delete a secret from the macOS Keychain. Silently succeeds if the entry does not exist.
pub fn keychain_delete(service: &str, account: &str) -> Result<(), String> {
    let Ok(entry) = keyring::Entry::new(service, account) else {
        return Ok(());
    };
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already gone
        Err(e) => Err(e.to_string()),
    }
}
