// System-browser OIDC login for the desktop shell (authorization code + PKCE S256, RFC 8252).
// The WebView never sees the authorization response: the callback lands on a one-shot loopback
// listener owned by Rust, is bound to the pending login's state and verifier, and the code is
// exchanged through a typed port. Access tokens stay in memory; only the refresh credential is
// written to the OS keychain through the CredentialStore port.
//
// AIDEV-NOTE: contract-request — the native token-exchange endpoint is not in contracts/v1 or v2.
// TokenExchange stays a typed port; ContractPendingExchange reports honest unavailability.
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
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
    PkcePair {
        challenge: challenge_for(&verifier),
        verifier,
    }
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
    /// Cancels the loopback listener of the current login so abandoning it frees the socket/thread.
    listener: Mutex<Option<ListenerHandle>>,
}

impl Default for LoginBroker {
    fn default() -> Self {
        Self {
            pending: Mutex::new(None),
            listener: Mutex::new(None),
        }
    }
}

impl LoginBroker {
    /// Attaches the listener serving the current login; any previous listener is cancelled.
    pub fn attach_listener(&self, handle: ListenerHandle) {
        if let Some(previous) = self
            .listener
            .lock()
            .expect("login broker lock poisoned")
            .replace(handle)
        {
            previous.cancel();
        }
    }

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
    pub fn complete_at(
        &self,
        callback_state: &str,
        code: &str,
        now: Instant,
    ) -> Result<AuthorizedGrant, AuthError> {
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
            return Err(AuthError::ProviderError(
                "authorization code missing".into(),
            ));
        }
        Ok(AuthorizedGrant {
            code: code.to_owned(),
            verifier: pending.pkce.verifier,
            redirect_uri: pending.redirect_uri,
        })
    }

    /// Drops any pending login and stops its loopback listener (sign-out, window close, timeout).
    pub fn abandon(&self) {
        *self.pending.lock().expect("login broker lock poisoned") = None;
        if let Some(handle) = self
            .listener
            .lock()
            .expect("login broker lock poisoned")
            .take()
        {
            handle.cancel();
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthConfigError {
    /// The issuer is absent, not HTTPS, unparsable, or carries credentials.
    InvalidIssuer,
}

/// Builds the Authentik authorization URL for the system browser. Issuer and client id are public
/// build-time values (like ELEVATEO_WEB_ORIGIN), never secrets.
///
/// AIDEV-NOTE: Authentik serves one authorize endpoint per host (`/application/o/authorize/`); the
/// issuer's per-application path must not prefix it, so the URL is built from the issuer origin.
pub fn authorize_url(
    issuer: &str,
    client_id: &str,
    pending: &PendingLogin,
) -> Result<url::Url, AuthConfigError> {
    let origin = crate::navigation::identity_provider_origin(Some(issuer))
        .ok_or(AuthConfigError::InvalidIssuer)?;
    let mut authorize = origin
        .join("application/o/authorize/")
        .map_err(|_| AuthConfigError::InvalidIssuer)?;
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

/// Proposed server exchange shared by the Mac, Windows and iOS clients (contract-requests §2).
pub const NATIVE_SESSIONS_PATH: &str = "/v1/native/sessions";

/// AIDEV-NOTE: contract-request — proposed POST {NATIVE_SESSIONS_PATH} {code, code_verifier,
/// redirect_uri, client_id} -> {access_token, token_type, expires_in, refresh_token}.
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

/// Longest accepted request line; a real callback (state + code) is far below this.
const MAX_REQUEST_LINE: u64 = 8 * 1024;
/// Per-connection read budget, so a client that connects and stalls cannot hold the listener.
const CONNECTION_READ_TIMEOUT: Duration = Duration::from_secs(2);
/// How often the non-blocking accept loop re-checks cancellation and the deadline.
const ACCEPT_POLL: Duration = Duration::from_millis(50);

/// Stops a running callback listener; dropping the handle does not stop it, `cancel` does.
#[derive(Debug, Clone)]
pub struct ListenerHandle(Arc<AtomicBool>);

impl ListenerHandle {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

/// Binds 127.0.0.1 on an OS-assigned port and serves exactly one callback request, then stops.
/// The listener also stops at `deadline` or when its handle is cancelled; the receiver then
/// reports disconnection instead of waiting forever.
pub fn spawn_callback_listener(
    deadline: Duration,
) -> std::io::Result<(u16, mpsc::Receiver<CallbackQuery>, ListenerHandle)> {
    // AIDEV-NOTE: loopback-only bind per RFC 8252 §7.3; a random port avoids squatting conflicts.
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    // Non-blocking accept so the thread can observe cancellation/deadline instead of parking
    // inside accept() until some client happens to connect.
    listener.set_nonblocking(true)?;
    let (sender, receiver) = mpsc::channel();
    let cancelled = Arc::new(AtomicBool::new(false));
    let handle = ListenerHandle(cancelled.clone());
    let stop_at = Instant::now() + deadline;
    std::thread::spawn(move || {
        while !cancelled.load(Ordering::SeqCst) && Instant::now() < stop_at {
            match listener.accept() {
                Ok((stream, _)) => {
                    // A stray request (favicon probe, wrong path, oversized or stalled) is answered
                    // or dropped and does not consume the one-shot slot; only a parsed /callback does.
                    if let Some(query) = handle_callback_request(stream) {
                        // The receiver may already be gone (login timed out); nothing left to notify.
                        let _ = sender.send(query);
                        return;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(ACCEPT_POLL)
                }
                Err(e) => {
                    eprintln!("loopback callback listener stopped: {e}");
                    return;
                }
            }
        }
    });
    Ok((port, receiver, handle))
}

/// Parses `GET /callback?...` from one connection; anything else gets 404/400 and None.
fn handle_callback_request(mut stream: TcpStream) -> Option<CallbackQuery> {
    // Accepted sockets inherit non-blocking mode on some platforms; reads here must block, bounded.
    stream.set_nonblocking(false).ok()?;
    stream
        .set_read_timeout(Some(CONNECTION_READ_TIMEOUT))
        .ok()?;
    let mut reader = BufReader::new(stream.try_clone().ok()?.take(MAX_REQUEST_LINE + 1));
    let mut request_line = String::new();
    // A stalled client hits the read timeout and errors here; it never blocks the listener for long.
    reader.read_line(&mut request_line).ok()?;
    if !request_line.ends_with('\n') {
        // Oversized (no newline within the limit) or truncated request line.
        let _ = stream.write_all(
            b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
        return None;
    }
    let path = request_line.strip_prefix("GET ")?.split(' ').next()?;
    let parsed = url::Url::parse(&format!("http://127.0.0.1{path}")).ok()?;
    if parsed.path() != "/callback" {
        let _ = stream
            .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
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

    /// apps/shared/auth-conformance-vectors.json: the same file the Windows and iOS suites read.
    fn shared_vectors() -> serde_json::Value {
        serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../shared/auth-conformance-vectors.json"
        )))
        .expect("shared auth vectors parse")
    }

    #[test]
    fn conforms_to_shared_auth_vectors() {
        let vectors = shared_vectors();
        for case in vectors["pkce_s256"].as_array().unwrap() {
            assert_eq!(
                challenge_for(case["verifier"].as_str().unwrap()),
                case["challenge"].as_str().unwrap()
            );
        }
        for case in vectors["identity_provider_endpoints"].as_array().unwrap() {
            let url = case["url"].as_str().unwrap();
            let accepted = crate::navigation::identity_provider_origin(Some(url)).is_some();
            assert_eq!(accepted, case["accepted"].as_bool().unwrap(), "{url}");
        }
        assert_eq!(
            vectors["native_session_exchange"]["path"],
            NATIVE_SESSIONS_PATH
        );
    }

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
        assert_eq!(
            broker.complete(&pending.state, "auth-code-1"),
            Err(AuthError::NoPendingLogin)
        );
    }

    #[test]
    fn state_mismatch_is_rejected_and_burns_the_pending_login() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        assert_eq!(
            broker.complete("wrong-state", "auth-code-1"),
            Err(AuthError::StateMismatch)
        );
        // The genuine callback can no longer complete either; the login must restart.
        assert_eq!(
            broker.complete(&pending.state, "auth-code-1"),
            Err(AuthError::NoPendingLogin)
        );
    }

    #[test]
    fn expired_pending_login_is_rejected() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        let late = Instant::now() + LOGIN_WINDOW + Duration::from_secs(1);
        assert_eq!(
            broker.complete_at(&pending.state, "auth-code-1", late),
            Err(AuthError::Expired)
        );
    }

    #[test]
    fn newer_login_replaces_the_older_pending_one() {
        let broker = LoginBroker::default();
        let old = broker.begin("http://127.0.0.1:49152/callback".into());
        let new = broker.begin("http://127.0.0.1:49153/callback".into());
        assert_eq!(
            broker.complete(&old.state, "auth-code-old"),
            Err(AuthError::StateMismatch)
        );
        // Mismatch burned the newer pending login too (documented availability tradeoff).
        assert_eq!(
            broker.complete(&new.state, "auth-code-new"),
            Err(AuthError::NoPendingLogin)
        );
    }

    #[test]
    fn empty_code_is_a_provider_error() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        assert_eq!(
            broker.complete(&pending.state, ""),
            Err(AuthError::ProviderError(
                "authorization code missing".into()
            ))
        );
    }

    #[test]
    fn exchange_port_reports_contract_unavailable() {
        let grant = AuthorizedGrant {
            code: "c".into(),
            verifier: "v".into(),
            redirect_uri: "r".into(),
        };
        // TokenSet has no PartialEq (it holds secrets); match the error instead of comparing Results.
        assert!(matches!(
            ContractPendingExchange.exchange(&grant),
            Err(ExchangeError::ContractUnavailable)
        ));
    }

    #[test]
    fn authorize_url_ignores_the_issuer_application_path() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        let url = authorize_url(
            "https://auth.company.org/application/o/elevateo/",
            "desktop-client",
            &pending,
        )
        .unwrap();
        assert_eq!(url.path(), "/application/o/authorize/");
        assert_eq!(url.host_str(), Some("auth.company.org"));
    }

    #[test]
    fn authorize_url_rejects_cleartext_and_credential_issuers() {
        let broker = LoginBroker::default();
        let pending = broker.begin("http://127.0.0.1:49152/callback".into());
        assert_eq!(
            authorize_url("http://auth.company.org/", "c", &pending),
            Err(AuthConfigError::InvalidIssuer)
        );
        assert_eq!(
            authorize_url("https://u:p@auth.company.org/", "c", &pending),
            Err(AuthConfigError::InvalidIssuer)
        );
        assert_eq!(
            authorize_url("not a url", "c", &pending),
            Err(AuthConfigError::InvalidIssuer)
        );
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

    fn send_request(port: u16, request: &[u8]) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(request).unwrap();
        let mut response = String::new();
        // The listener closes the connection after answering; read whatever it sent.
        let _ = stream.read_to_string(&mut response);
        response
    }

    #[test]
    fn loopback_listener_parses_one_callback() {
        let (port, receiver, _handle) = spawn_callback_listener(Duration::from_secs(10)).unwrap();
        send_request(
            port,
            b"GET /callback?state=abc&code=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
        );
        let query = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(
            query,
            CallbackQuery {
                state: "abc".into(),
                code: "xyz".into(),
                error: None
            }
        );
    }

    #[test]
    fn stray_request_gets_404_and_does_not_consume_the_listener() {
        let (port, receiver, _handle) = spawn_callback_listener(Duration::from_secs(10)).unwrap();
        assert!(
            send_request(port, b"GET /favicon.ico HTTP/1.1\r\n\r\n").starts_with("HTTP/1.1 404")
        );
        send_request(port, b"GET /callback?state=s&code=c HTTP/1.1\r\n\r\n");
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(5)).unwrap().code,
            "c"
        );
    }

    #[test]
    fn provider_error_callback_keeps_state_and_error_without_a_code() {
        let (port, receiver, _handle) = spawn_callback_listener(Duration::from_secs(10)).unwrap();
        send_request(
            port,
            b"GET /callback?state=s&error=access_denied HTTP/1.1\r\n\r\n",
        );
        let query = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(
            query,
            CallbackQuery {
                state: "s".into(),
                code: String::new(),
                error: Some("access_denied".into())
            }
        );
    }

    #[test]
    fn oversized_request_line_is_rejected_and_listener_keeps_serving() {
        let (port, receiver, _handle) = spawn_callback_listener(Duration::from_secs(10)).unwrap();
        let mut huge = b"GET /callback?state=".to_vec();
        huge.extend(std::iter::repeat_n(b'a', MAX_REQUEST_LINE as usize + 10));
        huge.extend_from_slice(b" HTTP/1.1\r\n\r\n");
        // The 400 itself may be lost to a TCP reset (unread bytes at close); what matters is that
        // the oversized line yields no callback, so the first one delivered is the genuine one.
        send_request(port, &huge);
        send_request(port, b"GET /callback?state=s&code=c HTTP/1.1\r\n\r\n");
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(5)).unwrap().state,
            "s"
        );
    }

    #[test]
    fn stalled_client_cannot_block_the_genuine_callback() {
        let (port, receiver, _handle) = spawn_callback_listener(Duration::from_secs(10)).unwrap();
        // Connects and never sends a newline; the per-connection read timeout releases it.
        let _stalled = TcpStream::connect(("127.0.0.1", port)).unwrap();
        send_request(port, b"GET /callback?state=s&code=c HTTP/1.1\r\n\r\n");
        let wait = CONNECTION_READ_TIMEOUT + Duration::from_secs(3);
        assert_eq!(receiver.recv_timeout(wait).unwrap().code, "c");
    }

    #[test]
    fn cancelled_or_expired_listener_stops_and_disconnects_the_receiver() {
        let (_port, receiver, handle) = spawn_callback_listener(Duration::from_secs(10)).unwrap();
        handle.cancel();
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(2)),
            Err(mpsc::RecvTimeoutError::Disconnected)
        );
        let (_port, receiver, _handle) =
            spawn_callback_listener(Duration::from_millis(100)).unwrap();
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(2)),
            Err(mpsc::RecvTimeoutError::Disconnected)
        );
    }

    #[test]
    fn abandoning_the_login_cancels_its_listener() {
        let broker = LoginBroker::default();
        let (_port, receiver, handle) = spawn_callback_listener(Duration::from_secs(10)).unwrap();
        broker.attach_listener(handle);
        broker.begin("http://127.0.0.1:49152/callback".into());
        broker.abandon();
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(2)),
            Err(mpsc::RecvTimeoutError::Disconnected)
        );
    }
}
