#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{webview::NewWindowResponse, Url, WebviewUrl, WebviewWindowBuilder};

// AIDEV-NOTE: Only bundled origins can navigate; this shell never hosts OAuth or receives remote native authority.
fn bundled_navigation(url: &Url) -> bool {
    url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && matches!(
            (url.scheme(), url.host_str()),
            ("tauri", Some("localhost")) | ("http", Some("tauri.localhost"))
        )
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            WebviewWindowBuilder::new(app, "preview", WebviewUrl::App("index.html".into()))
                .title("Elevateo Mail — Offline preview")
                .inner_size(1440.0, 900.0)
                .min_inner_size(390.0, 600.0)
                .devtools(false)
                .on_navigation(bundled_navigation)
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .on_download(|_, _| false)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Could not start the Elevateo Mail offline preview");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permits_bundled_pages_and_client_routes() {
        for value in ["tauri://localhost/index.html", "http://tauri.localhost/inbox?folder=sent"] {
            assert!(bundled_navigation(&Url::parse(value).unwrap()));
        }
    }

    #[test]
    fn rejects_external_and_privileged_navigation() {
        for value in [
            "https://accounts.google.com/", "https://tauri.localhost/", "http://localhost/",
            "http://tauri.localhost.evil.example/", "tauri://evil.example/", "file:///etc/passwd",
            "data:text/html,test", "javascript:alert(1)", "tauri://user@localhost/",
            "http://tauri.localhost:1234/",
        ] {
            assert!(!bundled_navigation(&Url::parse(value).unwrap()), "{value}");
        }
    }
}
