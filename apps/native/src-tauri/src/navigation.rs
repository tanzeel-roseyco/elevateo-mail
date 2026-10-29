use url::Url;

/// A remote WebView may only navigate within its one approved first-party HTTPS origin, plus the
/// single configured identity-provider origin so the web session's SSO round trip can complete.
///
/// AIDEV-NOTE: the IdP origin may load in the window but host commands still require the app origin
/// (host::require_first_party) and the init script exposes nothing there; see apps/android README.
pub fn is_approved_navigation(approved: &Url, identity_provider: Option<&Url>, candidate: &Url) -> bool {
    if candidate.scheme() != "https" {
        return false;
    }
    candidate.origin() == approved.origin() || identity_provider.is_some_and(|idp| candidate.origin() == idp.origin())
}

/// The HTTPS origin of the build-time OIDC issuer (e.g. `https://sso.company.org/application/o/x/`).
/// Anything else (absent, cleartext, unparsable, credentials in the URL) yields no IdP origin, so
/// navigation stays app-origin-only and SSO fails visibly instead of widening the allowlist.
pub fn identity_provider_origin(issuer: Option<&str>) -> Option<Url> {
    let parsed = Url::parse(issuer?.trim()).ok()?;
    if parsed.scheme() != "https" || !parsed.username().is_empty() || parsed.password().is_some() {
        return None;
    }
    Url::parse(&parsed.origin().ascii_serialization()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approved() -> Url { Url::parse("https://mail.company.org/").unwrap() }
    fn idp() -> Url { Url::parse("https://sso.company.org/").unwrap() }

    #[test]
    fn same_origin_routes_can_navigate() {
        assert!(is_approved_navigation(&approved(), None, &Url::parse("https://mail.company.org/auth/complete").unwrap()));
        assert!(is_approved_navigation(&approved(), None, &Url::parse("https://mail.company.org/#/inbox").unwrap()));
    }

    #[test]
    fn other_origins_and_lookalikes_are_denied() {
        assert!(!is_approved_navigation(&approved(), None, &Url::parse("https://api.company.org/").unwrap()));
        assert!(!is_approved_navigation(&approved(), None, &Url::parse("https://mail.company.org.evil.net/").unwrap()));
    }

    #[test]
    fn downgraded_and_local_schemes_are_denied() {
        assert!(!is_approved_navigation(&approved(), None, &Url::parse("http://mail.company.org/").unwrap()));
        assert!(!is_approved_navigation(&approved(), None, &Url::parse("file:///etc/passwd").unwrap()));
    }

    #[test]
    fn configured_identity_provider_origin_can_navigate_for_sso() {
        let authorize = Url::parse("https://sso.company.org/application/o/authorize/?state=x").unwrap();
        assert!(is_approved_navigation(&approved(), Some(&idp()), &authorize));
        assert!(!is_approved_navigation(&approved(), None, &authorize));
    }

    #[test]
    fn identity_provider_lookalikes_and_cleartext_are_denied() {
        assert!(!is_approved_navigation(&approved(), Some(&idp()), &Url::parse("https://sso.company.org.evil.net/").unwrap()));
        assert!(!is_approved_navigation(&approved(), Some(&idp()), &Url::parse("http://sso.company.org/").unwrap()));
        assert!(!is_approved_navigation(&approved(), Some(&idp()), &Url::parse("https://sso.company.org:8443/").unwrap()));
    }

    #[test]
    fn identity_provider_origin_parses_only_safe_https_issuers() {
        let origin = identity_provider_origin(Some("https://sso.company.org/application/o/elevateo/")).unwrap();
        assert_eq!(origin.as_str(), "https://sso.company.org/");
        assert_eq!(identity_provider_origin(None), None);
        assert_eq!(identity_provider_origin(Some("http://sso.company.org/")), None);
        assert_eq!(identity_provider_origin(Some("https://user:pw@sso.company.org/")), None);
        assert_eq!(identity_provider_origin(Some("not a url")), None);
    }
}
