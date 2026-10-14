use url::Url;

#[derive(Debug, PartialEq, Eq)]
pub enum ConfigError {
    Missing,
    InvalidUrl,
    InsecureOrigin,
    UnsupportedUrlParts,
}

/// Public API origin only. A valid value does not establish native authentication.
pub fn validate_api_origin(raw: &str) -> Result<String, ConfigError> {
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
    let host = parsed.host_str().ok_or(ConfigError::InvalidUrl)?;
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") ||
        host.eq_ignore_ascii_case("example.com") || host.ends_with(".example.com") ||
        host == "127.0.0.1" || host == "::1" ||
        host.ends_with(".invalid") || host.ends_with(".test") {
        return Err(ConfigError::InsecureOrigin);
    }
    if !parsed.username().is_empty() || parsed.password().is_some() ||
        parsed.path() != "/" || parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(ConfigError::UnsupportedUrlParts);
    }
    Ok(parsed.origin().ascii_serialization())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_public_https_origin() {
        assert_eq!(validate_api_origin("https://api.mail.company.org:443"), Ok("https://api.mail.company.org".into()));
    }

    #[test]
    fn rejects_cleartext_and_loopback() {
        assert_eq!(validate_api_origin("http://mail.test"), Err(ConfigError::InsecureOrigin));
        assert_eq!(validate_api_origin("https://localhost"), Err(ConfigError::InsecureOrigin));
    }

    #[test]
    fn rejects_credentials_path_and_query() {
        assert_eq!(validate_api_origin("https://user:pw@mail.test"), Err(ConfigError::UnsupportedUrlParts));
        assert_eq!(validate_api_origin("https://mail.test/v1?token=x"), Err(ConfigError::UnsupportedUrlParts));
    }
}
