#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod navigation;

fn main() {
    // AIDEV-NOTE: The public origin is embedded by the release build; absent or invalid config fails before any WebView.
    let approved = config::validate_web_origin(option_env!("ELEVATEO_WEB_ORIGIN").unwrap_or(""))
        .expect("ELEVATEO_WEB_ORIGIN must be one approved HTTPS web origin");
    tauri::Builder::default()
        .setup(move |app| {
            let navigation_origin = approved.clone();
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(approved.clone()))
                .title("Elevateo Mail")
                .inner_size(1120.0, 760.0)
                .on_navigation(move |url| navigation::is_approved_navigation(&navigation_origin, url))
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("native shell failed to start");
}
