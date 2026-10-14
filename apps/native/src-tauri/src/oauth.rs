use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use url::Url;
use zeroize::Zeroize;

const CALLBACK: &str = "elevateomail://oauth/callback";
const MAX_CALLBACK_BYTES: usize = 2048;
const LOGIN_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, PartialEq, Eq)]
pub enum OAuthError {
    InvalidAuthorizationEndpoint,
    RandomUnavailable,
    NoPendingLogin,
    Expired,
    InvalidCallback,
    StateMismatch,
    IssuerMismatch,
}

/// Code and verifier are native-only exchange material; never return them through renderer IPC.
pub struct ExchangeMaterial {
    pub code: String,
    pub verifier: String,
    pub nonce: String,
}

impl std::fmt::Debug for ExchangeMaterial {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ExchangeMaterial").finish_non_exhaustive()
    }
}

impl Drop for ExchangeMaterial {
    fn drop(&mut self) {
        self.code.zeroize();
        self.verifier.zeroize();
        self.nonce.zeroize();
    }
}

pub struct PendingLogin {
    state: String,
    verifier: String,
    nonce: String,
    issuer: String,
    started: Instant,
}

impl Drop for PendingLogin {
    fn drop(&mut self) {
        self.state.zeroize();
        self.verifier.zeroize();
        self.nonce.zeroize();
    }
}

pub struct NativeOAuth {
    pending: Option<PendingLogin>,
}

impl NativeOAuth {
    pub fn new() -> Self {
        Self { pending: None }
    }

    /// The caller must open the returned URL in the system browser, never an embedded WebView.
    /// Until a server exchange and protected store exist, production must not call this method.
    pub fn begin(&mut self, endpoint: &str, issuer: &str, client_id: &str) -> Result<Url, OAuthError> {
        self.pending = None;
        let mut url = Url::parse(endpoint).map_err(|_| OAuthError::InvalidAuthorizationEndpoint)?;
        if url.scheme() != "https" || url.host_str().is_none() ||
            !url.username().is_empty() || url.password().is_some() ||
            url.fragment().is_some() || client_id.is_empty() || client_id.len() > 256 ||
            !url.query().unwrap_or("").is_empty() {
            return Err(OAuthError::InvalidAuthorizationEndpoint);
        }
        let parsed_issuer = Url::parse(issuer).map_err(|_| OAuthError::InvalidAuthorizationEndpoint)?;
        if parsed_issuer.scheme() != "https" || parsed_issuer.host_str().is_none() ||
            parsed_issuer.path() != "/" || parsed_issuer.query().is_some() ||
            parsed_issuer.fragment().is_some() ||
            parsed_issuer.origin() != url.origin() {
            return Err(OAuthError::InvalidAuthorizationEndpoint);
        }
        let verifier = random_base64(32)?;
        let state = random_base64(32)?;
        let nonce = random_base64(32)?;
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", client_id)
            .append_pair("redirect_uri", CALLBACK)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", &state)
            .append_pair("nonce", &nonce);
        self.pending = Some(PendingLogin { state, verifier, nonce, issuer: parsed_issuer.origin().ascii_serialization(), started: Instant::now() });
        Ok(url)
    }

    /// A callback burns the pending operation before parsing so replay and malformed retries fail closed.
    pub fn consume_callback(&mut self, raw: &str) -> Result<ExchangeMaterial, OAuthError> {
        let pending = self.pending.take().ok_or(OAuthError::NoPendingLogin)?;
        if pending.started.elapsed() > LOGIN_TTL {
            return Err(OAuthError::Expired);
        }
        if raw.len() > MAX_CALLBACK_BYTES || raw.as_bytes().contains(&0) {
            return Err(OAuthError::InvalidCallback);
        }
        let url = Url::parse(raw).map_err(|_| OAuthError::InvalidCallback)?;
        if url.scheme() != "elevateomail" || url.host_str() != Some("oauth") ||
            url.path() != "/callback" || url.fragment().is_some() ||
            !url.username().is_empty() || url.password().is_some() {
            return Err(OAuthError::InvalidCallback);
        }
        let mut code = None;
        let mut state = None;
        let mut issuer = None;
        for (key, value) in url.query_pairs() {
            if value.is_empty() || value.len() > 1024 {
                return Err(OAuthError::InvalidCallback);
            }
            match key.as_ref() {
                "code" if code.is_none() => code = Some(value.into_owned()),
                "state" if state.is_none() => state = Some(value.into_owned()),
                "iss" if issuer.is_none() => issuer = Some(value.into_owned()),
                _ => return Err(OAuthError::InvalidCallback),
            }
        }
        let code = code.ok_or(OAuthError::InvalidCallback)?;
        let state = state.ok_or(OAuthError::InvalidCallback)?;
        let issuer = issuer.ok_or(OAuthError::InvalidCallback)?;
        if issuer.as_bytes().ct_eq(pending.issuer.as_bytes()).unwrap_u8() != 1 {
            return Err(OAuthError::IssuerMismatch);
        }
        if state.as_bytes().ct_eq(pending.state.as_bytes()).unwrap_u8() != 1 {
            return Err(OAuthError::StateMismatch);
        }
        Ok(ExchangeMaterial { code, verifier: pending.verifier, nonce: pending.nonce })
    }

    pub fn cancel(&mut self) {
        self.pending = None;
    }
}

fn random_base64(size: usize) -> Result<String, OAuthError> {
    let mut bytes = vec![0_u8; size];
    getrandom::getrandom(&mut bytes).map_err(|_| OAuthError::RandomUnavailable)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_callback_succeeds_once_without_renderer_token() {
        let mut login = NativeOAuth::new();
        let authorization = login.begin("https://auth.mail.company.org/authorize", "https://auth.mail.company.org", "public-client").unwrap();
        assert_eq!(authorization.query_pairs().find(|(key, _)| key == "code_challenge_method").unwrap().1, "S256");
        let state = authorization.query_pairs().find(|(key, _)| key == "state").unwrap().1.into_owned();
        let callback = format!("{CALLBACK}?code=one-time-code&state={state}&iss=https%3A%2F%2Fauth.mail.company.org");
        let material = login.consume_callback(&callback).unwrap();
        assert_eq!(material.code, "one-time-code");
        let expected = URL_SAFE_NO_PAD.encode(Sha256::digest(material.verifier.as_bytes()));
        assert_eq!(authorization.query_pairs().find(|(key, _)| key == "code_challenge").unwrap().1, expected);
        assert!(!material.nonce.is_empty());
        assert_eq!(login.consume_callback(&callback).unwrap_err(), OAuthError::NoPendingLogin);
    }

    #[test]
    fn wrong_state_burns_pending_login() {
        let mut login = NativeOAuth::new();
        login.begin("https://auth.mail.company.org/authorize", "https://auth.mail.company.org", "public-client").unwrap();
        assert_eq!(login.consume_callback(&format!("{CALLBACK}?code=x&state=wrong&iss=https%3A%2F%2Fauth.mail.company.org")).unwrap_err(), OAuthError::StateMismatch);
        assert_eq!(login.consume_callback(&format!("{CALLBACK}?code=x&state=wrong&iss=https%3A%2F%2Fauth.mail.company.org")).unwrap_err(), OAuthError::NoPendingLogin);
    }

    #[test]
    fn wrong_issuer_burns_pending_login() {
        let mut login = NativeOAuth::new();
        let url = login.begin("https://auth.mail.company.org/authorize", "https://auth.mail.company.org", "public-client").unwrap();
        let state = url.query_pairs().find(|(key, _)| key == "state").unwrap().1.into_owned();
        assert_eq!(login.consume_callback(&format!("{CALLBACK}?code=x&state={state}&iss=https%3A%2F%2Fevil.org")).unwrap_err(), OAuthError::IssuerMismatch);
        assert_eq!(login.consume_callback(&format!("{CALLBACK}?code=x&state={state}&iss=https%3A%2F%2Fauth.mail.company.org")).unwrap_err(), OAuthError::NoPendingLogin);
    }

    #[test]
    fn token_query_and_duplicate_code_are_rejected() {
        let mut login = NativeOAuth::new();
        login.begin("https://auth.mail.company.org/authorize", "https://auth.mail.company.org", "public-client").unwrap();
        assert_eq!(login.consume_callback(&format!("{CALLBACK}?code=x&state=y&iss=https%3A%2F%2Fauth.mail.company.org&access_token=secret")).unwrap_err(), OAuthError::InvalidCallback);
        let url = login.begin("https://auth.mail.company.org/authorize", "https://auth.mail.company.org", "public-client").unwrap();
        let state = url.query_pairs().find(|(key, _)| key == "state").unwrap().1.into_owned();
        assert_eq!(login.consume_callback(&format!("{CALLBACK}?code=x&code=y&state={state}&iss=https%3A%2F%2Fauth.mail.company.org")).unwrap_err(), OAuthError::InvalidCallback);
    }
}
