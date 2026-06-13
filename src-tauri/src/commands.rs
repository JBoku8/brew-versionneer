use crate::brew::{self, BrewStatus};
use crate::config::{self, AppConfig};
use crate::remote::{self, CatalogKind};
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::AppHandle;
use tauri::Manager;

/// Run a blocking brew subprocess off the main thread so slow calls
/// (`brew info --installed` can take seconds) never freeze the UI.
async fn blocking<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("Background task failed: {e}"))
}

#[tauri::command]
pub async fn check_brew() -> Result<BrewStatus, String> {
    blocking(brew::check_brew).await
}

/// Fast path: filesystem lookup only (~1ms), no `brew --version`.
#[tauri::command]
pub async fn detect_brew() -> Result<BrewStatus, String> {
    blocking(brew::detect_brew).await
}

#[tauri::command]
pub async fn get_brew_version() -> Result<Option<String>, String> {
    blocking(brew::brew_version).await
}

#[tauri::command]
pub async fn get_installed_formulae() -> Result<Value, String> {
    blocking(brew::get_installed_formulae_json).await?
}

#[tauri::command]
pub async fn get_installed_formula_names() -> Result<Vec<String>, String> {
    blocking(brew::get_installed_formula_names).await?
}

/// Fast command: returns {name: installedVersion} map (~100ms via `brew list --versions`).
#[tauri::command]
pub async fn get_installed_versions() -> Result<Value, String> {
    blocking(brew::get_installed_versions_json).await?
}

/// Fast command: returns outdated formulae/casks (~300ms via `brew outdated --json=v2`).
#[tauri::command]
pub async fn get_outdated_formulae() -> Result<Value, String> {
    blocking(brew::get_outdated_json).await?
}

/// Upgrade the given formulae, streaming brew's output lines to the frontend.
#[tauri::command]
pub async fn upgrade_packages(names: Vec<String>, on_output: Channel<String>) -> Result<(), String> {
    blocking(move || {
        brew::upgrade_packages(&names, move |line| {
            let _ = on_output.send(line);
        })
    })
    .await?
}

/// Send input to an in-progress upgrade (e.g. `"y\n"` to confirm a prompt).
#[tauri::command]
pub async fn upgrade_respond(response: String) -> Result<(), String> {
    blocking(move || brew::upgrade_respond(&response)).await?
}

/// Abort an in-progress upgrade.
#[tauri::command]
pub async fn upgrade_cancel() -> Result<(), String> {
    blocking(brew::upgrade_cancel).await?
}

/// Generate a Brewfile from the current installation (`brew bundle dump --file=-`).
#[tauri::command]
pub async fn export_brewfile() -> Result<String, String> {
    blocking(brew::export_brewfile).await?
}

/// Update the menu-bar tray with the current outdated-package count.
#[tauri::command]
pub fn update_tray_count(app: AppHandle, outdated: u32) {
    if let Some(tray) = app.tray_by_id("main") {
        let title = if outdated > 0 {
            Some(format!("↑{outdated}"))
        } else {
            None
        };
        let _ = tray.set_title(title);
        let tooltip = if outdated > 0 {
            format!("Brew Versionneer — {outdated} outdated package(s)")
        } else {
            "Brew Versionneer — everything up to date".to_string()
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
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
        catalog_ttl_hours(&app),
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
        catalog_ttl_hours(&app),
    )
    .await
}

/// Cache TTL from the user's config (Settings → Catalog Cache), with the
/// built-in default if the config can't be read.
fn catalog_ttl_hours(app: &AppHandle) -> u64 {
    app_data_dir(app)
        .map(|dir| config::read_config(&dir).cache.ttl_hours)
        .unwrap_or_else(|_| config::CacheConfig::default().ttl_hours)
}

#[tauri::command]
pub async fn fetch_formula_detail(name: String) -> Result<Value, String> {
    remote::fetch_formula_detail(&name).await
}

#[tauri::command]
pub async fn fetch_cask_detail(token: String) -> Result<Value, String> {
    remote::fetch_cask_detail(&token).await
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
