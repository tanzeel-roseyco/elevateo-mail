use url::Url;

/// A remote WebView may only navigate within its one approved first-party HTTPS origin.
pub fn is_approved_navigation(approved: &Url, candidate: &Url) -> bool {
    candidate.scheme() == "https" && candidate.origin() == approved.origin()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approved() -> Url { Url::parse("https://mail.company.org/").unwrap() }

    #[test]
    fn same_origin_routes_can_navigate() {
        assert!(is_approved_navigation(&approved(), &Url::parse("https://mail.company.org/auth/complete").unwrap()));
        assert!(is_approved_navigation(&approved(), &Url::parse("https://mail.company.org/#/inbox").unwrap()));
    }

    #[test]
    fn other_origins_and_lookalikes_are_denied() {
        assert!(!is_approved_navigation(&approved(), &Url::parse("https://api.company.org/").unwrap()));
        assert!(!is_approved_navigation(&approved(), &Url::parse("https://mail.company.org.evil.net/").unwrap()));
    }

    #[test]
    fn downgraded_and_local_schemes_are_denied() {
        assert!(!is_approved_navigation(&approved(), &Url::parse("http://mail.company.org/").unwrap()));
        assert!(!is_approved_navigation(&approved(), &Url::parse("file:///etc/passwd").unwrap()));
    }
}
