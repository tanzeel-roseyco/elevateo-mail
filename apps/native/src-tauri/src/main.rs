#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;

fn main() {
    // AIDEV-NOTE: Native auth is absent; no IPC command, token bridge, or remote page is registered.
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("native shell failed to start");
}
