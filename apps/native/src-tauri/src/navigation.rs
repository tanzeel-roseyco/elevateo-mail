use url::Url;

/// Only Tauri's bundled-asset origins may host the privileged webview.
pub fn is_bundled_navigation(url: &Url) -> bool {
    (url.scheme() == "tauri" && url.host_str() == Some("localhost")) ||
        ((url.scheme() == "https" || url.scheme() == "http") &&
            url.host_str() == Some("tauri.localhost") &&
            url.port().is_none())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_assets_can_navigate() {
        assert!(is_bundled_navigation(&Url::parse("tauri://localhost/index.html").unwrap()));
        assert!(is_bundled_navigation(&Url::parse("https://tauri.localhost/index.html").unwrap()));
    }

    #[test]
    fn remote_origin_cannot_navigate() {
        assert!(!is_bundled_navigation(&Url::parse("https://mail.company.org/").unwrap()));
        assert!(!is_bundled_navigation(&Url::parse("https://tauri.localhost.evil.org/").unwrap()));
    }

    #[test]
    fn untrusted_schemes_and_ports_are_denied() {
        assert!(!is_bundled_navigation(&Url::parse("file:///etc/passwd").unwrap()));
        assert!(!is_bundled_navigation(&Url::parse("https://tauri.localhost:444/").unwrap()));
    }
}
