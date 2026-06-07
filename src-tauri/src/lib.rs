mod brew;
mod commands;
mod config;
mod remote;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::check_brew,
            commands::detect_brew,
            commands::get_brew_version,
            commands::get_installed_formulae,
            commands::get_installed_formula_names,
            commands::get_installed_versions,
            commands::get_outdated_formulae,
            commands::fetch_formulae_catalog,
            commands::fetch_casks_catalog,
            commands::fetch_formula_detail,
            commands::read_config,
            commands::write_config,
            commands::read_keychain,
            commands::write_keychain,
            commands::delete_keychain,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
