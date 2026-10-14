#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod navigation;
mod oauth;
mod session_store;

fn main() {
    // AIDEV-NOTE: Manual creation applies navigation policy before any bundled UI loads.
    tauri::Builder::default()
        .setup(|app| {
            let window = app.config().app.windows.first().expect("missing main window config");
            tauri::WebviewWindowBuilder::from_config(app.handle(), window)?
                .on_navigation(navigation::is_bundled_navigation)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("native shell failed to start");
}
