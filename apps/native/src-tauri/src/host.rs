// Narrow native command surface exposed to the one approved web origin, plus the update flow.
// Email content never crosses this boundary: commands carry only booleans, runtime names and
// status strings. Everything else (mail, drafts, search) stays HTTPS between WebView and server.
//
// AIDEV-NOTE: the assistant bridge commands (agents_start/send/cancel/end) belong to the backend
// agent in src/agents (not created yet); the web panel probes them and shows unavailable until then.
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::auth::{
    authorize_url, AuthError, ContractPendingExchange, CredentialStore, ExchangeError, KeychainStore,
    LoginBroker, TokenExchange,
};
use crate::update::{gate_install, mark_ready, BusyState, InstallGate, SharedBusy};

/// Public build-time OIDC values; like ELEVATEO_WEB_ORIGIN these are configuration, not secrets.
pub const OIDC_ISSUER: Option<&str> = option_env!("ELEVATEO_OIDC_ISSUER");
pub const OIDC_CLIENT_ID: Option<&str> = option_env!("ELEVATEO_OIDC_CLIENT_ID");
/// Updater manifest endpoint and its signing public key (the private key stays in release automation).
pub const UPDATE_MANIFEST_URL: Option<&str> = option_env!("ELEVATEO_UPDATE_MANIFEST_URL");
pub const UPDATER_PUBKEY: Option<&str> = option_env!("ELEVATEO_UPDATER_PUBKEY");

/// Typed capability object the web UI validates; detection is by this shape, never user agent.
#[derive(Debug, Clone, Serialize)]
pub struct HostCapabilities {
    pub desktop: bool,
    pub platform: &'static str,
    pub version: &'static str,
    /// False until the backend agent lands src/agents and flips this with its commands.
    pub assistant_bridge: bool,
}

#[tauri::command]
pub fn host_capabilities() -> HostCapabilities {
    HostCapabilities {
        desktop: true,
        platform: std::env::consts::OS,
        version: env!("CARGO_PKG_VERSION"),
        assistant_bridge: false,
    }
}

/// The web UI reports work an update install must not interrupt.
#[tauri::command]
pub fn host_report_busy(busy: State<'_, SharedBusy>, unsaved_draft: bool, send_in_progress: bool) {
    *busy.0.lock().expect("busy lock poisoned") = BusyState { unsaved_draft, send_in_progress };
}

/// The web UI reached its first meaningful screen: the post-update health check passes.
#[tauri::command]
pub fn host_ready(app: AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    mark_ready(&data_dir).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthEvent {
    pub status: &'static str,
    pub message: String,
}

fn emit_auth(app: &AppHandle, status: &'static str, message: String) {
    let _ = app.emit("host://auth", AuthEvent { status, message });
}

/// Starts system-browser OIDC login: loopback listener, pending state+verifier, browser launch.
/// The outcome arrives as `host://auth` events; the command returns once the browser is opened.
#[tauri::command]
pub fn auth_begin_login(app: AppHandle, broker: State<'_, LoginBroker>) -> Result<(), String> {
    let (Some(issuer), Some(client_id)) = (OIDC_ISSUER, OIDC_CLIENT_ID) else {
        return Err("Desktop sign-in is not configured in this build (OIDC issuer/client id absent).".into());
    };
    let (port, receiver) = crate::auth::spawn_callback_listener().map_err(|e| format!("loopback listener failed: {e}"))?;
    let pending = broker.begin(format!("http://127.0.0.1:{port}/callback"));
    let url = authorize_url(issuer, client_id, &pending).map_err(|e| format!("authorize URL invalid: {e}"))?;
    let app_for_thread = app.clone();
    std::thread::spawn(move || {
        // Wait at most the login window for the one-shot callback, then validate and exchange.
        let Ok(query) = receiver.recv_timeout(crate::auth::LOGIN_WINDOW + Duration::from_secs(5)) else {
            emit_auth(&app_for_thread, "error", "Sign-in timed out waiting for the browser callback.".into());
            return;
        };
        if let Some(provider_error) = query.error {
            // Provider error codes are bounded identifiers; still cap length before surfacing.
            let short: String = provider_error.chars().take(64).collect();
            emit_auth(&app_for_thread, "error", format!("The identity provider reported: {short}"));
            return;
        }
        let broker = app_for_thread.state::<LoginBroker>();
        let grant = match broker.complete(&query.state, &query.code) {
            Ok(grant) => grant,
            Err(AuthError::StateMismatch) => return emit_auth(&app_for_thread, "error", "Sign-in callback did not match this login attempt. Start again.".into()),
            Err(AuthError::Expired) => return emit_auth(&app_for_thread, "error", "Sign-in took too long and expired. Start again.".into()),
            Err(AuthError::NoPendingLogin) => return emit_auth(&app_for_thread, "error", "Sign-in callback arrived with no login in progress (possible replay); it was rejected.".into()),
            Err(AuthError::ProviderError(message)) => return emit_auth(&app_for_thread, "error", message),
        };
        match ContractPendingExchange.exchange(&grant) {
            Ok(tokens) => {
                if let Err(e) = KeychainStore.save_refresh(&tokens.refresh_token) {
                    return emit_auth(&app_for_thread, "error", format!("Signed in, but the refresh credential could not be stored: {e:?}"));
                }
                emit_auth(&app_for_thread, "signed_in", "Signed in.".into());
            }
            Err(ExchangeError::ContractUnavailable) => emit_auth(
                &app_for_thread,
                "exchange_unavailable",
                "The authorization was received, but the server's native token-exchange endpoint is not available yet.".into(),
            ),
            Err(ExchangeError::Rejected(message)) => emit_auth(&app_for_thread, "error", message),
        }
    });
    // AIDEV-NOTE: the system browser owns credentials entry; the WebView never sees the IdP page.
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| format!("system browser could not be opened: {e}"))
}

/// Erases local tokens: pending login, keychain refresh credential. Server-side revocation is a
/// separate contract (reported); the web UI still performs its own cookie sign-out.
#[tauri::command]
pub fn auth_sign_out(broker: State<'_, LoginBroker>) -> Result<(), String> {
    broker.abandon();
    KeychainStore.clear().map_err(|e| format!("keychain clear failed: {e:?}"))
}

// ---- update flow ------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct UpdateEvent {
    pub status: &'static str,
    pub message: String,
}

pub fn emit_update(app: &AppHandle, status: &'static str, message: String) {
    let _ = app.emit("host://update", UpdateEvent { status, message });
}

/// Menu-triggered update check. Installs only when the busy gate allows it; archives the current
/// bundle first so the next launch can roll back if it never reaches ready.
pub fn check_for_updates(app: AppHandle) {
    let (Some(endpoint), Some(pubkey)) = (UPDATE_MANIFEST_URL, UPDATER_PUBKEY) else {
        emit_update(&app, "unconfigured", "Updates are not configured in this build.".into());
        return;
    };
    tauri::async_runtime::spawn(async move {
        if let Err(message) = run_update(&app, endpoint, pubkey).await {
            emit_update(&app, "error", message);
        }
    });
}

async fn run_update(app: &AppHandle, endpoint: &str, pubkey: &str) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    emit_update(app, "checking", "Checking for updates…".into());
    let endpoint_url = endpoint.parse().map_err(|e| format!("update endpoint invalid: {e}"))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint_url])
        .map_err(|e| format!("update endpoint rejected: {e}"))?
        .pubkey(pubkey)
        .build()
        .map_err(|e| format!("updater unavailable: {e}"))?;
    let Some(update) = updater.check().await.map_err(|e| format!("update check failed: {e}"))? else {
        emit_update(app, "up_to_date", "You are on the latest version.".into());
        return Ok(());
    };
    // Never install over an unsaved draft or an in-flight send; the person retries later.
    let busy = *app.state::<SharedBusy>().0.lock().expect("busy lock poisoned");
    if gate_install(busy) == InstallGate::BlockedBusy {
        emit_update(app, "blocked_busy", "An update is available, but a draft is unsaved or a send is in progress. Finish that first, then check again.".into());
        return Ok(());
    }
    emit_update(app, "downloading", format!("Downloading version {}…", update.version));
    prepare_rollback(app, &update.version).map_err(|e| format!("could not archive the current app for rollback: {e}"))?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("update install failed: {e}"))?;
    emit_update(app, "installed", "Update installed. Restart Elevateo Mail to finish.".into());
    Ok(())
}

/// Archives the running .app and writes the not-yet-ready launch marker (macOS bundles only).
fn prepare_rollback(app: &AppHandle, version: &str) -> std::io::Result<()> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    #[cfg(target_os = "macos")]
    {
        // exe is <bundle>.app/Contents/MacOS/<name>; walk up three levels to the bundle root.
        let exe = std::env::current_exe()?;
        if let Some(bundle) = exe.ancestors().nth(3).filter(|p| p.extension().is_some_and(|e| e == "app")) {
            crate::update::archive_current_bundle(bundle, &crate::update::archive_path(&data_dir))?;
        }
    }
    let marker = crate::update::LaunchMarker {
        updated_to: version.to_owned(),
        installed_at_epoch_secs: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        ready: false,
    };
    crate::update::write_marker(&data_dir, &marker)
}

// ---- network probe ----------------------------------------------------------------------------

/// Background reachability probe against the approved origin's TLS port. The init script
/// translates `host://network-changed` into window online/offline events, so the existing
/// ConnectivityBanner surfaces the drop without any web code change.
pub fn spawn_network_probe(app: AppHandle, host: String) {
    std::thread::spawn(move || {
        let mut online = true;
        loop {
            let reachable = std::net::ToSocketAddrs::to_socket_addrs(&(host.as_str(), 443))
                .ok()
                .and_then(|mut addrs| addrs.next())
                .is_some_and(|addr| std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(5)).is_ok());
            if reachable != online {
                online = reachable;
                let _ = app.emit("host://network-changed", serde_json::json!({ "online": online }));
            }
            std::thread::sleep(Duration::from_secs(30));
        }
    });
}
