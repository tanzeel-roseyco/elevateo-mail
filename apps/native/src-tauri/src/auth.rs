// System-browser OIDC login for the desktop shell (authorization code + PKCE S256, RFC 8252).
// The WebView never sees the authorization response: the callback lands on a one-shot loopback
// listener owned by Rust, is bound to the pending login's state and verifier, and the code is
// exchanged through a typed port. Access tokens stay in memory; only the refresh credential is
// written to the OS keychain through the CredentialStore port.
//
// AIDEV-NOTE: contract-request — the native token-exchange endpoint is not in contracts/v1 or v2.
// TokenExchange stays a typed port; ContractPendingExchange reports honest unavailability.
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

/// A pending login expires after this window; a later callback is rejected, not adopted.
pub const LOGIN_WINDOW: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

/// 32 random bytes -> 43-char base64url verifier (RFC 7636 §4.1 length bounds 43..=128).
pub fn new_pkce() -> PkcePair {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    PkcePair { challenge: challenge_for(&verifier), verifier }
}

pub fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

#[derive(Debug, Clone)]
pub struct PendingLogin {
    pub state: String,
    pub pkce: PkcePair,
    pub redirect_uri: String,
    created: Instant,
}

/// The state+verifier of a login whose callback matched; input to the token exchange.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizedGrant {
    pub code: String,
    pub verifier: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthError {
    /// No login is pending: either none started, or a previous callback already consumed it (replay).
    NoPendingLogin,
    /// Callback state does not match the pending login; the pending login is burned (see proposal).
    StateMismatch,
    /// The pending login outlived LOGIN_WINDOW before its callback arrived.
    Expired,
    /// The provider returned an error or an empty code on the callback.
    ProviderError(String),
}

/// Owns at most one pending login. `complete` consumes the pending entry exactly once, so a
/// replayed callback (second delivery of the same state+code) fails with NoPendingLogin.
pub struct LoginBroker {
    pending: Mutex<Option<PendingLogin>>,
}

impl Default for LoginBroker {
    fn default() -> Self {
        Self { pending: Mutex::new(None) }
    }
}

impl LoginBroker {
    /// Starts a login, replacing (burning) any earlier pending one.
    pub fn begin(&self, redirect_uri: String) -> PendingLogin {
        let pending = PendingLogin {
            state: random_token(),
            pkce: new_pkce(),
            redirect_uri,
            created: Instant::now(),
        };
        *self.pending.lock().expect("login broker lock poisoned") = Some(pending.clone());
        pending
    }

    /// Validates a callback against the pending login and consumes it.
    ///
    /// AIDEV-NOTE: mismatch burns the pending login (availability tradeoff from the auth proposal):
    /// a stale callback cannot be retried against newer state, and the newer login must restart.
    pub fn complete(&self, callback_state: &str, code: &str) -> Result<AuthorizedGrant, AuthError> {
        self.complete_at(callback_state, code, Instant::now())
    }

    /// Clock-injected variant so expiry is deterministic under test.
    pub fn complete_at(&self, callback_state: &str, code: &str, now: Instant) -> Result<AuthorizedGrant, AuthError> {
        let pending = self
            .pending
            .lock()
            .expect("login broker lock poisoned")
            .take()
            .ok_or(AuthError::NoPendingLogin)?;
        if callback_state != pending.state {
            return Err(AuthError::StateMismatch);
        }
        if now.duration_since(pending.created) > LOGIN_WINDOW {
            return Err(AuthError::Expired);
        }
        if code.is_empty() {
            return Err(AuthError::ProviderError("authorization code missing".into()));
        }
        Ok(AuthorizedGrant {
            code: code.to_owned(),
            verifier: pending.pkce.verifier,
            redirect_uri: pending.redirect_uri,
        })
    }

    /// Drops any pending login (sign-out, window close).
    pub fn abandon(&self) {
        *self.pending.lock().expect("login broker lock poisoned") = None;
    }
}

/// Builds the Authentik authorization URL for the system browser. Issuer and client id are public
/// build-time values (like ELEVATEO_WEB_ORIGIN), never secrets.
pub fn authorize_url(issuer: &str, client_id: &str, pending: &PendingLogin) -> Result<url::Url, url::ParseError> {
    let mut authorize = url::Url::parse(issuer)?.join("application/o/authorize/")?;
    authorize
        .query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", &pending.redirect_uri)
        .append_pair("scope", "openid profile email offline_access")
        .append_pair("state", &pending.state)
        .append_pair("code_challenge", &pending.pkce.challenge)
        .append_pair("code_challenge_method", "S256");
    Ok(authorize)
}

// ---- token exchange port -------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct TokenSet {
    /// Kept in memory only; never persisted.
    pub access_token: String,
    /// The only value allowed into the OS keychain.
    pub refresh_token: String,
    pub expires_in_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExchangeError {
    /// The server endpoint is not yet in contracts; login cannot finish and says so honestly.
    ContractUnavailable,
    Rejected(String),
}

pub trait TokenExchange: Send + Sync {
    fn exchange(&self, grant: &AuthorizedGrant) -> Result<TokenSet, ExchangeError>;
}

/// AIDEV-NOTE: contract-request — proposed POST /v1/native/sessions {code, code_verifier,
/// redirect_uri, client_id} -> {access_token, refresh_token, expires_in}; see final report.
pub struct ContractPendingExchange;

impl TokenExchange for ContractPendingExchange {
    fn exchange(&self, _grant: &AuthorizedGrant) -> Result<TokenSet, ExchangeError> {
        Err(ExchangeError::ContractUnavailable)
    }
}

// ---- refresh-credential storage port --------------------------------------------------------

#[derive(Debug)]
pub enum StoreError {
    Unavailable(String),
}

pub trait CredentialStore: Send + Sync {
    fn save_refresh(&self, refresh_token: &str) -> Result<(), StoreError>;
    fn load_refresh(&self) -> Result<Option<String>, StoreError>;
    fn clear(&self) -> Result<(), StoreError>;
}

const KEYCHAIN_SERVICE: &str = "com.elevateo.mail";
const KEYCHAIN_ACCOUNT: &str = "refresh-credential";

/// macOS Keychain (and the platform equivalent elsewhere) via the keyring crate.
pub struct KeychainStore;

impl KeychainStore {
    fn entry() -> Result<keyring::Entry, StoreError> {
        keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
            .map_err(|e| StoreError::Unavailable(e.to_string()))
    }
}

impl CredentialStore for KeychainStore {
    fn save_refresh(&self, refresh_token: &str) -> Result<(), StoreError> {
        Self::entry()?
            .set_password(refresh_token)
            .map_err(|e| StoreError::Unavailable(e.to_string()))
    }

    fn load_refresh(&self) -> Result<Option<String>, StoreError> {
        match Self::entry()?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(StoreError::Unavailable(e.to_string())),
        }
    }

    fn clear(&self) -> Result<(), StoreError> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(StoreError::Unavailable(e.to_string())),
        }
    }
}

// ---- loopback callback listener -------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallbackQuery {
    pub state: String,
    pub code: String,
    /// Provider `error` parameter, if the user denied or the provider failed.
    pub error: Option<String>,
}

/// Binds 127.0.0.1 on an OS-assigned port and serves exactly one callback request, then stops.
/// Returns the bound port and the receiver that yields the parsed callback once.
pub fn spawn_callback_listener() -> std::io::Result<(u16, mpsc::Receiver<CallbackQuery>)> {
    // AIDEV-NOTE: loopback-only bind per RFC 8252 §7.3; a random port avoids squatting conflicts.
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        // Accept until one valid /callback request arrives or the channel is dropped.
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            // A stray request (favicon probe, wrong path) is answered 404 and does not consume
            // the one-shot slot; only a parsed /callback ends the listener.
            if let Some(query) = handle_callback_request(stream) {
                let _ = sender.send(query);
                return;
            }
        }
    });
    Ok((port, receiver))
}

/// Parses `GET /callback?...` from one connection; anything else gets 404 and None.
fn handle_callback_request(mut stream: TcpStream) -> Option<CallbackQuery> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line).ok()?;
    let path = request_line.strip_prefix("GET ")?.split(' ').next()?;
    let parsed = url::Url::parse(&format!("http://127.0.0.1{path}")).ok()?;
    if parsed.path() != "/callback" {
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return None;
    }
    let mut state = String::new();
    let mut code = String::new();
    let mut error = None;
    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "state" => state = value.into_owned(),
            "code" => code = value.into_owned(),
            "error" => error = Some(value.into_owned()),
            _ => {}
        }
    }
    // The body deliberately contains nothing attacker-controlled: no echo of query parameters.
    let body = "Sign-in received. You can close this tab and return to Elevateo Mail.";
    let _ = stream.write_all(
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .as_bytes(),
    );
    Some(CallbackQuery { state, code, error })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_s256_of_verifier() {
        let pair = new_pkce();
        assert_eq!(pair.verifier.len(), 43);
        assert_eq!(pair.challenge, challenge_for(&pair.verifier));
        // Known vector from RFC 7636 appendix B.
        assert_eq!(
            challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn matching_callback_completes_and_yields_grant() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        let grant = broker.complete(&pending.state, "auth-code-1").unwrap();
        assert_eq!(grant.code, "auth-code-1");
        assert_eq!(grant.verifier, pending.pkce.verifier);
        assert_eq!(grant.redirect_uri, "http://127.0.0.1:49152/callback");
    }

    #[test]
    fn replayed_callback_is_rejected_after_first_completion() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        broker.complete(&pending.state, "auth-code-1").unwrap();
        assert_eq!(broker.complete(&pending.state, "auth-code-1"), Err(AuthError::NoPendingLogin));
    }

    #[test]
    fn state_mismatch_is_rejected_and_burns_the_pending_login() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        assert_eq!(broker.complete("wrong-state", "auth-code-1"), Err(AuthError::StateMismatch));
        // The genuine callback can no longer complete either; the login must restart.
        assert_eq!(broker.complete(&pending.state, "auth-code-1"), Err(AuthError::NoPendingLogin));
    }

    #[test]
    fn expired_pending_login_is_rejected() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        let late = Instant::now() + LOGIN_WINDOW + Duration::from_secs(1);
        assert_eq!(broker.complete_at(&pending.state, "auth-code-1", late), Err(AuthError::Expired));
    }

    #[test]
    fn newer_login_replaces_the_older_pending_one() {
        let broker = LoginBroker::default();
        let old = broker.begin("http://127.0.0.1:49152/callback".into());
        let new = broker.begin("http://127.0.0.1:49153/callback".into());
        assert_eq!(broker.complete(&old.state, "auth-code-old"), Err(AuthError::StateMismatch));
        // Mismatch burned the newer pending login too (documented availability tradeoff).
        assert_eq!(broker.complete(&new.state, "auth-code-new"), Err(AuthError::NoPendingLogin));
    }

    #[test]
    fn empty_code_is_a_provider_error() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        assert_eq!(
            broker.complete(&pending.state, ""),
            Err(AuthError::ProviderError("authorization code missing".into()))
        );
    }

    #[test]
    fn exchange_port_reports_contract_unavailable() {
        let grant = AuthorizedGrant { code: "c".into(), verifier: "v".into(), redirect_uri: "r".into() };
        assert_eq!(ContractPendingExchange.exchange(&grant), Err(ExchangeError::ContractUnavailable));
    }

    #[test]
    fn authorize_url_carries_state_and_s256_challenge() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        let url = authorize_url("https://auth.company.org/", "desktop-client", &pending).unwrap();
        let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(url.path(), "/application/o/authorize/");
        assert_eq!(query["state"], pending.state);
        assert_eq!(query["code_challenge"], pending.pkce.challenge);
        assert_eq!(query["code_challenge_method"], "S256");
        assert_eq!(query["response_type"], "code");
    }

    #[test]
    fn loopback_listener_parses_one_callback() {
        let (port, receiver) = spawn_callback_listener().unwrap();
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream
            .write_all(b"GET /callback?state=abc&code=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            .unwrap();
        let query = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(query, CallbackQuery { state: "abc".into(), code: "xyz".into(), error: None });
    }
}
