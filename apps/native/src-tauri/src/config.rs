use url::{Host, Url};

#[derive(Debug, PartialEq, Eq)]
pub enum ConfigError {
    NonReleaseArtifact,
    Missing,
    InvalidUrl,
    InsecureOrigin,
    UnsupportedUrlParts,
}

const QA_HOST: &str = "elevateo.qa.internal";
const QA_ORIGIN: &str = "https://elevateo.qa.internal";

/// Compile fixtures stay inert; the isolated emulator package can launch only in debug builds.
pub fn launch_origin(raw: &str, artifact_kind: &str) -> Result<Url, ConfigError> {
    // AIDEV-NOTE: QA trust is debug-only and exact-origin; release markers cannot promote the fixture host.
    if artifact_kind == "isolated-qa" && cfg!(debug_assertions) && raw == QA_ORIGIN {
        return validate_web_origin(raw);
    }
    if artifact_kind != "unsigned-candidate" {
        return Err(ConfigError::NonReleaseArtifact);
    }
    let parsed = validate_web_origin(raw)?;
    if parsed
        .host_str()
        .is_some_and(|host| host.trim_end_matches('.').eq_ignore_ascii_case(QA_HOST))
    {
        return Err(ConfigError::NonReleaseArtifact);
    }
    Ok(parsed)
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
    // A terminal DNS dot is equivalent to the same hostname without it.
    let canonical_host = host.trim_end_matches('.');
    if canonical_host.is_empty()
        || canonical_host.eq_ignore_ascii_case("localhost")
        || canonical_host.ends_with(".localhost")
        || canonical_host.eq_ignore_ascii_case("example.com")
        || canonical_host.ends_with(".example.com")
        || canonical_host.eq_ignore_ascii_case("invalid")
        || canonical_host.ends_with(".invalid")
        || canonical_host.eq_ignore_ascii_case("test")
        || canonical_host.ends_with(".test")
    {
        return Err(ConfigError::InsecureOrigin);
    }
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(ConfigError::UnsupportedUrlParts);
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_and_unmarked_artifacts_cannot_launch() {
        assert_eq!(
            launch_origin("https://mail.company.org", "compile-only-fixture"),
            Err(ConfigError::NonReleaseArtifact)
        );
        assert_eq!(
            launch_origin("https://mail.company.org", ""),
            Err(ConfigError::NonReleaseArtifact)
        );
        assert_eq!(
            launch_origin("https://mail.company.org", "unknown"),
            Err(ConfigError::NonReleaseArtifact)
        );
    }

    #[test]
    fn isolated_qa_requires_debug_and_the_exact_origin() {
        let result = launch_origin(QA_ORIGIN, "isolated-qa");
        if cfg!(debug_assertions) {
            assert_eq!(result.unwrap().as_str(), "https://elevateo.qa.internal/");
        } else {
            assert_eq!(result, Err(ConfigError::NonReleaseArtifact));
        }
        for raw in [
            "https://mail.company.org",
            "http://elevateo.qa.internal",
            "https://elevateo.qa.internal/",
            "https://elevateo.qa.internal:444",
            "https://elevateo.qa.internal.attacker.org",
            "https://elevateo.qa.internal?token=x",
        ] {
            assert_eq!(
                launch_origin(raw, "isolated-qa"),
                Err(ConfigError::NonReleaseArtifact)
            );
        }
    }

    #[test]
    fn candidate_marker_cannot_promote_qa_host() {
        for raw in [
            QA_ORIGIN,
            "https://ELEVATEO.QA.INTERNAL.",
            "https://elevateo.qa.internal:444",
        ] {
            assert_eq!(
                launch_origin(raw, "unsigned-candidate"),
                Err(ConfigError::NonReleaseArtifact)
            );
        }
        assert_eq!(
            launch_origin(QA_ORIGIN, "compile-only-fixture"),
            Err(ConfigError::NonReleaseArtifact)
        );
    }

    #[test]
    fn rejects_missing_whitespace_ip_and_oversized_origins() {
        assert_eq!(
            launch_origin("", "unsigned-candidate"),
            Err(ConfigError::Missing)
        );
        for raw in [" https://mail.company.org", "https://mail.company.org\n"] {
            assert_eq!(validate_web_origin(raw), Err(ConfigError::InvalidUrl));
        }
        for raw in ["https://127.0.0.1", "https://[::1]"] {
            assert_eq!(validate_web_origin(raw), Err(ConfigError::InsecureOrigin));
        }
        assert_eq!(
            validate_web_origin(&format!("https://{}", "a".repeat(2041))),
            Err(ConfigError::InvalidUrl)
        );
        assert_eq!(
            validate_web_origin("https://mail.company.org#token"),
            Err(ConfigError::UnsupportedUrlParts)
        );
        assert_eq!(
            validate_web_origin("https://:secret@mail.company.org"),
            Err(ConfigError::UnsupportedUrlParts)
        );
    }

    #[test]
    fn accepts_exact_public_https_origin() {
        assert_eq!(
            launch_origin("https://mail.company.org", "unsigned-candidate")
                .unwrap()
                .as_str(),
            "https://mail.company.org/"
        );
    }

    #[test]
    fn rejects_cleartext_local_and_placeholder() {
        assert_eq!(
            validate_web_origin("http://mail.company.org"),
            Err(ConfigError::InsecureOrigin)
        );
        assert_eq!(
            validate_web_origin("https://localhost"),
            Err(ConfigError::InsecureOrigin)
        );
        assert_eq!(
            validate_web_origin("https://example.com"),
            Err(ConfigError::InsecureOrigin)
        );
        assert_eq!(
            validate_web_origin("https://invalid"),
            Err(ConfigError::InsecureOrigin)
        );
        assert_eq!(
            validate_web_origin("https://test"),
            Err(ConfigError::InsecureOrigin)
        );
        assert_eq!(
            validate_web_origin("https://INVALID."),
            Err(ConfigError::InsecureOrigin)
        );
        assert_eq!(
            launch_origin("https://TEST./", "unsigned-candidate"),
            Err(ConfigError::InsecureOrigin)
        );
        assert_eq!(
            validate_web_origin("https://app.elevateo.invalid."),
            Err(ConfigError::InsecureOrigin)
        );
        assert_eq!(
            launch_origin("https://APP.ELEVATEO.INVALID./", "unsigned-candidate"),
            Err(ConfigError::InsecureOrigin)
        );
        assert_eq!(
            validate_web_origin("https://app.elevateo.invalid.."),
            Err(ConfigError::InsecureOrigin)
        );
    }

    #[test]
    fn rejects_credentials_path_and_query() {
        assert_eq!(
            validate_web_origin("https://user:pw@mail.company.org"),
            Err(ConfigError::UnsupportedUrlParts)
        );
        assert_eq!(
            validate_web_origin("https://mail.company.org/v1?token=x"),
            Err(ConfigError::UnsupportedUrlParts)
        );
    }
}
