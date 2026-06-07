use crate::brew::{self, BrewStatus};
use crate::config::{self, AppConfig};
use crate::remote::{self, CatalogKind};
use serde_json::Value;
use tauri::AppHandle;
use tauri::Manager;

#[tauri::command]
pub fn check_brew() -> BrewStatus {
    brew::check_brew()
}

/// Fast path: filesystem lookup only (~1ms), no `brew --version`.
#[tauri::command]
pub fn detect_brew() -> BrewStatus {
    brew::detect_brew()
}

#[tauri::command]
pub fn get_brew_version() -> Option<String> {
    brew::brew_version()
}

#[tauri::command]
pub fn get_installed_formulae() -> Result<Value, String> {
    brew::get_installed_formulae_json()
}

#[tauri::command]
pub fn get_installed_formula_names() -> Result<Vec<String>, String> {
    brew::get_installed_formula_names()
}

/// Fast command: returns {name: installedVersion} map (~100ms via `brew list --versions`).
#[tauri::command]
pub fn get_installed_versions() -> Result<Value, String> {
    brew::get_installed_versions_json()
}

/// Fast command: returns outdated formulae/casks (~300ms via `brew outdated --json=v1`).
#[tauri::command]
pub fn get_outdated_formulae() -> Result<Value, String> {
    brew::get_outdated_json()
}

#[tauri::command]
pub async fn fetch_formulae_catalog(
    app: AppHandle,
    force_refresh: Option<bool>,
) -> Result<Value, String> {
    let cache_dir = app_cache_dir(&app)?;
    remote::fetch_catalog(
        &cache_dir,
        CatalogKind::Formulae,
        force_refresh.unwrap_or(false),
    )
    .await
}

#[tauri::command]
pub async fn fetch_casks_catalog(
    app: AppHandle,
    force_refresh: Option<bool>,
) -> Result<Value, String> {
    let cache_dir = app_cache_dir(&app)?;
    remote::fetch_catalog(
        &cache_dir,
        CatalogKind::Casks,
        force_refresh.unwrap_or(false),
    )
    .await
}

#[tauri::command]
pub async fn fetch_formula_detail(name: String) -> Result<Value, String> {
    remote::fetch_formula_detail(&name).await
}

// ── Config commands ───────────────────────────────────────────────────────────

/// Read app configuration from Application Support. Returns defaults if the file is absent.
#[tauri::command]
pub fn read_config(app: AppHandle) -> AppConfig {
    let data_dir = match app_data_dir(&app) {
        Ok(d) => d,
        Err(_) => return AppConfig::default(),
    };
    config::read_config(&data_dir)
}

/// Persist app configuration to Application Support (API key excluded — use write_keychain).
#[tauri::command]
pub fn write_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let data_dir = app_data_dir(&app)?;
    config::write_config(&data_dir, &config)
}

// ── Keychain commands ─────────────────────────────────────────────────────────

/// Read a secret from the macOS Keychain. Returns `null` if not found.
#[tauri::command]
pub fn read_keychain(service: String, account: String) -> Option<String> {
    config::keychain_read(&service, &account)
}

/// Store a secret in the macOS Keychain (creates or replaces the entry).
#[tauri::command]
pub fn write_keychain(service: String, account: String, secret: String) -> Result<(), String> {
    config::keychain_write(&service, &account, &secret)
}

/// Delete a secret from the macOS Keychain. Succeeds silently if the entry does not exist.
#[tauri::command]
pub fn delete_keychain(service: String, account: String) -> Result<(), String> {
    config::keychain_delete(&service, &account)
}

// ── Directory helpers ─────────────────────────────────────────────────────────

fn app_cache_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?;
    Ok(remote::cache_dir_from_app(base))
}

fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}
