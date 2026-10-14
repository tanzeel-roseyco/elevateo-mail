use url::{Host, Url};

#[derive(Debug, PartialEq, Eq)]
pub enum ConfigError {
    NonReleaseArtifact,
    Missing,
    InvalidUrl,
    InsecureOrigin,
    UnsupportedUrlParts,
}

/// A compile-only fixture cannot launch even if a future validator accidentally accepts its host.
pub fn launch_origin(raw: &str, artifact_kind: &str) -> Result<Url, ConfigError> {
    if artifact_kind != "unsigned-candidate" {
        return Err(ConfigError::NonReleaseArtifact);
    }
    validate_web_origin(raw)
}

/// Public first-party web origin for an online-only WebView; never a token or arbitrary route.
pub fn validate_web_origin(raw: &str) -> Result<Url, ConfigError> {
    if raw.is_empty() {
        return Err(ConfigError::Missing);
    }
    if raw.trim() != raw || raw.len() > 2048 {
        return Err(ConfigError::InvalidUrl);
    }
    let parsed = Url::parse(raw).map_err(|_| ConfigError::InvalidUrl)?;
    if parsed.scheme() != "https" {
        return Err(ConfigError::InsecureOrigin);
    }
    let host = match parsed.host() {
        Some(Host::Domain(domain)) => domain,
        _ => return Err(ConfigError::InsecureOrigin),
    };
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") ||
        host.eq_ignore_ascii_case("example.com") || host.ends_with(".example.com") ||
        host.ends_with(".invalid") || host.ends_with(".test") {
        return Err(ConfigError::InsecureOrigin);
    }
    if !parsed.username().is_empty() || parsed.password().is_some() ||
        parsed.path() != "/" || parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(ConfigError::UnsupportedUrlParts);
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_and_unmarked_artifacts_cannot_launch() {
        assert_eq!(launch_origin("https://mail.company.org", "compile-only-fixture"), Err(ConfigError::NonReleaseArtifact));
        assert_eq!(launch_origin("https://mail.company.org", ""), Err(ConfigError::NonReleaseArtifact));
    }

    #[test]
    fn accepts_exact_public_https_origin() {
        assert_eq!(launch_origin("https://mail.company.org", "unsigned-candidate").unwrap().as_str(), "https://mail.company.org/");
    }

    #[test]
    fn rejects_cleartext_local_and_placeholder() {
        assert_eq!(validate_web_origin("http://mail.company.org"), Err(ConfigError::InsecureOrigin));
        assert_eq!(validate_web_origin("https://localhost"), Err(ConfigError::InsecureOrigin));
        assert_eq!(validate_web_origin("https://example.com"), Err(ConfigError::InsecureOrigin));
    }

    #[test]
    fn rejects_credentials_path_and_query() {
        assert_eq!(validate_web_origin("https://user:pw@mail.company.org"), Err(ConfigError::UnsupportedUrlParts));
        assert_eq!(validate_web_origin("https://mail.company.org/v1?token=x"), Err(ConfigError::UnsupportedUrlParts));
    }
}
