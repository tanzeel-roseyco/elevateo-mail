// Narrow native command surface exposed to the one approved web origin (enforced per command by
// require_first_party), plus the update flow.
// Email content never crosses this boundary: commands carry only booleans, runtime names and
// status strings. Everything else (mail, drafts, search) stays HTTPS between WebView and server.
//
// AIDEV-NOTE: the assistant bridge commands (agents_start/send/cancel/end) belong to the backend
// agent in src/agents (not created yet); the web panel probes them and shows unavailable until then.
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, Webview};

use crate::auth::{
    authorize_url, AuthError, ContractPendingExchange, CredentialStore, ExchangeError,
    KeychainStore, LoginBroker, TokenExchange,
};
use crate::update::{gate_install, mark_ready, BusyState, InstallGate, SharedBusy};

/// Logs a native event that could not be delivered to the page; payloads are status text only.
fn emit_or_log<P: Serialize + Clone>(app: &AppHandle, event: &str, payload: P) {
    if let Err(e) = app.emit(event, payload) {
        eprintln!("native event {event} could not be delivered: {e}");
    }
}

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

/// The one approved app origin, managed as state so every command can check its caller.
pub struct FirstPartyOrigin(pub url::Url);

/// Rejects a command unless the calling page is on the approved app origin.
///
/// AIDEV-NOTE: required because the window may also show the IdP origin during SSO and the capability's
/// remote context is `https://*`; navigation.rs alone no longer implies "only our page can invoke".
fn require_first_party(webview: &Webview, origin: &FirstPartyOrigin) -> Result<(), String> {
    let current = webview
        .url()
        .map_err(|e| format!("caller page unknown: {e}"))?;
    if crate::navigation::is_approved_navigation(&origin.0, None, &current) {
        Ok(())
    } else {
        Err("This page is not allowed to use desktop commands.".into())
    }
}

#[tauri::command]
pub fn host_capabilities(
    webview: Webview,
    origin: State<'_, FirstPartyOrigin>,
) -> Result<HostCapabilities, String> {
    require_first_party(&webview, &origin)?;
    Ok(HostCapabilities {
        desktop: true,
        platform: std::env::consts::OS,
        version: env!("CARGO_PKG_VERSION"),
        assistant_bridge: false,
    })
}

/// The web UI reports work an update install must not interrupt. `complete` is false until every
/// web busy source has reported once; an incomplete report keeps the gate at "unknown" (blocked).
#[tauri::command]
pub fn host_report_busy(
    webview: Webview,
    origin: State<'_, FirstPartyOrigin>,
    busy: State<'_, SharedBusy>,
    unsaved_draft: bool,
    send_in_progress: bool,
    complete: bool,
) -> Result<(), String> {
    require_first_party(&webview, &origin)?;
    let state = complete.then_some(BusyState {
        unsaved_draft,
        send_in_progress,
    });
    *busy
        .0
        .lock()
        .map_err(|_| "busy state unavailable".to_string())? = state;
    Ok(())
}

/// The web UI reached its first meaningful screen: the post-update health check passes.
#[tauri::command]
pub fn host_ready(
    app: AppHandle,
    webview: Webview,
    origin: State<'_, FirstPartyOrigin>,
) -> Result<(), String> {
    // An IdP page finishing its load is not the app becoming healthy.
    require_first_party(&webview, &origin)?;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    // `false` (no launched update pending) is the normal case, not an error.
    mark_ready(&data_dir)
        .map(|_| ())
        .map_err(|e| format!("update health could not be recorded: {e}"))
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthEvent {
    pub status: &'static str,
    pub message: String,
}

fn emit_auth(app: &AppHandle, status: &'static str, message: String) {
    emit_or_log(app, "host://auth", AuthEvent { status, message });
}

/// Starts system-browser OIDC login: loopback listener, pending state+verifier, browser launch.
/// The outcome arrives as `host://auth` events; the command returns once the browser is opened.
#[tauri::command]
pub fn auth_begin_login(
    app: AppHandle,
    webview: Webview,
    origin: State<'_, FirstPartyOrigin>,
    broker: State<'_, LoginBroker>,
) -> Result<(), String> {
    require_first_party(&webview, &origin)?;
    let (Some(issuer), Some(client_id)) = (OIDC_ISSUER, OIDC_CLIENT_ID) else {
        return Err(
            "Desktop sign-in is not configured in this build (OIDC issuer/client id absent)."
                .into(),
        );
    };
    // Validate configuration before opening any socket (authorize_url applies the same rule).
    if crate::navigation::identity_provider_origin(Some(issuer)).is_none() {
        return Err("Desktop sign-in is misconfigured: the OIDC issuer must be an HTTPS URL without credentials.".into());
    }
    let listener_deadline = crate::auth::LOGIN_WINDOW + Duration::from_secs(5);
    let (port, receiver, listener) = crate::auth::spawn_callback_listener(listener_deadline)
        .map_err(|e| format!("loopback listener failed: {e}"))?;
    broker.attach_listener(listener);
    let pending = broker.begin(format!("http://127.0.0.1:{port}/callback"));
    let url = authorize_url(issuer, client_id, &pending)
        .map_err(|_| "authorize URL invalid".to_string())?;
    let app_for_thread = app.clone();
    std::thread::spawn(move || {
        // Wait at most the login window for the one-shot callback, then validate and exchange.
        // Waits the login window only; the listener outlives it by 5 s, so a real timeout is seen
        // as Timeout here and Disconnected can only mean cancellation or replacement.
        let query = match receiver.recv_timeout(crate::auth::LOGIN_WINDOW) {
            Ok(query) => query,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                return emit_auth(
                    &app_for_thread,
                    "error",
                    "Sign-in timed out waiting for the browser callback.".into(),
                );
            }
            // The listener was cancelled (sign-out) or replaced by a newer login: that attempt
            // reports its own outcome, so this one ends quietly instead of claiming a timeout.
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
        };
        if let Some(provider_error) = query.error {
            // Provider error codes are bounded identifiers; still cap length before surfacing.
            let short: String = provider_error.chars().take(64).collect();
            emit_auth(
                &app_for_thread,
                "error",
                format!("The identity provider reported: {short}"),
            );
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
    // AIDEV-NOTE: native PKCE login enters credentials in the system browser; only the web-session SSO
    // flow shows the IdP in the WebView (allowed by navigation.rs, denied host commands).
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| format!("system browser could not be opened: {e}"))
}

/// Erases local tokens: pending login, keychain refresh credential. Server-side revocation is a
/// separate contract (reported); the web UI still performs its own cookie sign-out.
#[tauri::command]
pub fn auth_sign_out(
    webview: Webview,
    origin: State<'_, FirstPartyOrigin>,
    broker: State<'_, LoginBroker>,
) -> Result<(), String> {
    require_first_party(&webview, &origin)?;
    broker.abandon();
    KeychainStore
        .clear()
        .map_err(|e| format!("keychain clear failed: {e:?}"))
}

// ---- update flow ------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct UpdateEvent {
    pub status: &'static str,
    pub message: String,
}

pub fn emit_update(app: &AppHandle, status: &'static str, message: String) {
    emit_or_log(app, "host://update", UpdateEvent { status, message });
}

/// Menu-triggered update check. Installs only when the busy gate allows it (checked before the
/// download and again right before install); archives the current bundle so a launch of the update
/// that never reaches ready is rolled back on the following start.
pub fn check_for_updates(app: AppHandle) {
    let (Some(endpoint), Some(pubkey)) = (UPDATE_MANIFEST_URL, UPDATER_PUBKEY) else {
        emit_update(
            &app,
            "unconfigured",
            "Updates are not configured in this build.".into(),
        );
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
    let endpoint_url = endpoint
        .parse()
        .map_err(|e| format!("update endpoint invalid: {e}"))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint_url])
        .map_err(|e| format!("update endpoint rejected: {e}"))?
        .pubkey(pubkey)
        .build()
        .map_err(|e| format!("updater unavailable: {e}"))?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|e| format!("update check failed: {e}"))?
    else {
        emit_update(app, "up_to_date", "You are on the latest version.".into());
        return Ok(());
    };
    // Cheap early gate so a busy person is not made to wait for a download first.
    if blocked_by_busy_gate(app)? {
        return Ok(());
    }
    emit_update(
        app,
        "downloading",
        format!("Downloading version {}…", update.version),
    );
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| format!("update download failed: {e}"))?;
    // AIDEV-NOTE: drafts/sends may start during the download, so the gate is re-read right before
    // install. Installing only replaces the bundle on disk; the running app (and any work started
    // after this check) is interrupted only by the restart the person chooses later.
    if blocked_by_busy_gate(app)? {
        return Ok(());
    }
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data directory unavailable: {e}"))?;
    let archive = crate::update::archive_path(&data_dir);
    archive_running_bundle(&archive)
        .map_err(|e| format!("could not archive the current app for rollback: {e}"))?;
    if let Err(e) = update.install(bytes) {
        // No marker was written, so nothing will roll back; drop the now-useless archive.
        if let Err(cleanup) = crate::update::remove_dir_if_present(&archive) {
            eprintln!("could not remove the rollback archive after a failed install: {cleanup}");
        }
        return Err(format!("update install failed: {e}"));
    }
    // Only a completed install arms the health check (Installed -> Launched -> Ready, see update.rs).
    let marker = crate::update::LaunchMarker {
        updated_to: update.version.clone(),
        phase: crate::update::MarkerPhase::Installed,
    };
    crate::update::write_marker(&data_dir, &marker)
        .map_err(|e| format!("update installed, but its health check could not be armed: {e}"))?;
    emit_update(
        app,
        "installed",
        "Update installed. Restart Elevateo Mail to finish.".into(),
    );
    Ok(())
}

/// Returns true (after telling the person why) when the busy gate does not allow an install now.
fn blocked_by_busy_gate(app: &AppHandle) -> Result<bool, String> {
    let busy = *app
        .state::<SharedBusy>()
        .0
        .lock()
        .map_err(|_| "busy state unavailable".to_string())?;
    let message = match gate_install(busy) {
        InstallGate::Proceed => return Ok(false),
        InstallGate::BlockedBusy => "An update is available, but a draft is unsaved or a send is in progress. Finish that first, then check again.",
        InstallGate::BlockedUnknown => "An update is available, but Elevateo Mail has not finished loading your drafts and sends. Try again in a moment.",
    };
    emit_update(app, "blocked_busy", message.into());
    Ok(true)
}

/// Copies the running .app aside so a launch that never becomes ready can be rolled back.
/// Outside a macOS bundle (dev runs, other desktops) there is nothing to archive.
fn archive_running_bundle(archive: &std::path::Path) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        if let Some(bundle) = running_app_bundle()? {
            return crate::update::archive_current_bundle(&bundle, archive);
        }
    }
    let _ = archive;
    Ok(())
}

/// exe is <bundle>.app/Contents/MacOS/<name>; walk up three levels to the bundle root.
#[cfg(target_os = "macos")]
pub fn running_app_bundle() -> std::io::Result<Option<std::path::PathBuf>> {
    let exe = std::env::current_exe()?;
    Ok(exe
        .ancestors()
        .nth(3)
        .filter(|p| p.extension().is_some_and(|e| e == "app"))
        .map(|p| p.to_path_buf()))
}

// ---- network probe ----------------------------------------------------------------------------

/// Background reachability probe against the approved origin's own port (443 unless explicit). The init script
/// translates `host://network-changed` into window online/offline events, so the existing
/// ConnectivityBanner surfaces the drop without any web code change.
pub fn spawn_network_probe(app: AppHandle, host: String, port: u16) {
    std::thread::spawn(move || {
        let mut online = true;
        loop {
            let reachable = std::net::ToSocketAddrs::to_socket_addrs(&(host.as_str(), port))
                .ok()
                .and_then(|mut addrs| addrs.next())
                .is_some_and(|addr| {
                    std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(5)).is_ok()
                });
            if reachable != online {
                online = reachable;
                emit_or_log(
                    &app,
                    "host://network-changed",
                    serde_json::json!({ "online": online }),
                );
            }
            std::thread::sleep(Duration::from_secs(30));
        }
    });
}
