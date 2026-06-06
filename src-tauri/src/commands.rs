use crate::brew::{self, BrewStatus};
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

fn app_cache_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?;
    Ok(remote::cache_dir_from_app(base))
}
