mod brew;
mod commands;
mod config;
mod remote;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Menu-bar tray: title shows the outdated count (set via update_tray_count).
            let show = MenuItem::with_id(app, "show", "Open Brew Versionneer", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().expect("app icon missing").clone())
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
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
            commands::fetch_cask_detail,
            commands::upgrade_packages,
            commands::export_brewfile,
            commands::update_tray_count,
            commands::read_config,
            commands::write_config,
            commands::read_keychain,
            commands::write_keychain,
            commands::delete_keychain,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
