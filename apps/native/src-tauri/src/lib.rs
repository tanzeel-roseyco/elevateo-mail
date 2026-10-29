// Guarded desktop shell: one approved HTTPS first-party origin, exact-origin navigation, denied
// popups/permissions, and a deliberately narrow native surface (see host.rs). New in FC-MAC:
// single instance, app/Edit menus, system-browser OIDC login, signed auto-update with rollback,
// and a network probe surfaced to the web UI. Email content never reaches native commands.
// Login, update and host-command surfaces are desktop-only; the Android fixture lane compiles the
// same crate without them (and without the keyring/updater/opener plugins).
#[cfg(desktop)]
mod auth;
mod config;
#[cfg(desktop)]
mod host;
mod navigation;
#[cfg(desktop)]
mod update;

#[cfg(desktop)]
use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};
#[cfg(desktop)]
use tauri::{Emitter, Manager};

/// Injected before any page script. It is the typed desktop capability the web UI validates
/// (`window.elevateoDesktop`), the event subscription helper, the network-event translation into
/// standard window online/offline events, and the post-load ready ping for the update health check.
///
/// AIDEV-NOTE: couples to apps/web/src/features/assistant/bridge.ts (desktopHostSchema) and to
/// Tauri's __TAURI_INTERNALS__ IPC object; revisit on Tauri major upgrades.
fn init_script(app_origin: &str) -> String {
    format!(
        r#"(function () {{
  'use strict';
  // The IdP origin may load in this window during SSO; it gets no capability object.
  if (window.location.origin !== '{app_origin}') return;
  var internals = window.__TAURI_INTERNALS__;
  if (!internals) return; // IPC not granted to this page: expose no capability object.
  function invoke(cmd, args) {{ return internals.invoke(cmd, args || {{}}); }}
  function listen(event, callback) {{
    return invoke('plugin:event|listen', {{
      event: event,
      target: {{ kind: 'Any' }},
      handler: internals.transformCallback(function (raw) {{ callback(raw.payload); }}),
    }}).then(function (id) {{
      return function () {{ invoke('plugin:event|unlisten', {{ event: event, eventId: id }}); }};
    }});
  }}
  Object.defineProperty(window, 'elevateoDesktop', {{
    value: Object.freeze({{ desktop: true, platform: '{platform}', version: '{version}', invoke: invoke, listen: listen }}),
    writable: false, configurable: false,
  }});
  // Native reachability probe -> the standard events the web ConnectivityBanner already handles.
  listen('host://network-changed', function (payload) {{
    window.dispatchEvent(new Event(payload && payload.online ? 'online' : 'offline'));
  }});
  // The page finishing a real load from the approved origin is the post-update health signal.
  window.addEventListener('load', function () {{ invoke('host_ready').catch(function () {{}}); }});
}})();"#,
        platform = std::env::consts::OS,
        version = env!("CARGO_PKG_VERSION"),
        // validate_web_origin guarantees a bare https origin, so this cannot break out of the JS string.
        app_origin = app_origin,
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // AIDEV-NOTE: Build kind and embedded origin are checked together before any WebView; QA is debug-only.
    let approved = config::launch_origin(
        option_env!("ELEVATEO_WEB_ORIGIN").unwrap_or(""),
        option_env!("ELEVATEO_NATIVE_ARTIFACT").unwrap_or(""),
    )
        .expect("ELEVATEO_WEB_ORIGIN must be one approved HTTPS web origin");

    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        // A second launch focuses the existing window instead of starting another shell.
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(host::FirstPartyOrigin(approved.clone()))
        .manage(auth::LoginBroker::default())
        .manage(update::SharedBusy::default())
        .invoke_handler(tauri::generate_handler![
            host::host_capabilities,
            host::host_report_busy,
            host::host_ready,
            host::auth_begin_login,
            host::auth_sign_out,
        ]);
    builder
        .setup(move |app| {
            #[cfg(desktop)]
            {
            // Post-update health verdict from the previous launch, before any window exists.
            let data_dir = app.path().app_data_dir()?;
            let marker = update::read_marker(&data_dir);
            let archive = update::archive_path(&data_dir);
            match update::post_launch_action(marker.as_ref(), archive.is_dir()) {
                update::PostLaunchAction::None => {}
                update::PostLaunchAction::KeepAndCleanUp => {
                    update::clear_marker(&data_dir)?;
                    let _ = std::fs::remove_dir_all(&archive);
                }
                update::PostLaunchAction::Rollback => {
                    #[cfg(target_os = "macos")]
                    {
                        let exe = std::env::current_exe()?;
                        if let Some(bundle) = exe.ancestors().nth(3).filter(|p| p.extension().is_some_and(|e| e == "app")) {
                            update::restore_previous_bundle(bundle, &archive)?;
                            update::clear_marker(&data_dir)?;
                            // Re-exec: the path now holds the restored previous version.
                            app.handle().restart();
                        }
                    }
                    // Not a macOS bundle (dev run): nothing to restore into; clear and continue.
                    update::clear_marker(&data_dir)?;
                }
                update::PostLaunchAction::FailedNoArchive => {
                    update::clear_marker(&data_dir)?;
                    eprintln!("previous update launch failed its health check and no archive exists; keeping current version");
                }
            }

            // App + Edit menus. Edit's predefined items give the WebView standard clipboard keys.
            let app_menu = SubmenuBuilder::new(app, "Elevateo Mail")
                .about(Some(AboutMetadata::default()))
                .separator()
                .text("check-updates", "Check for Updates…")
                .text("sign-out", "Sign Out")
                .separator()
                .quit()
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let menu = MenuBuilder::new(app).items(&[&app_menu, &edit_menu]).build()?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| match event.id().as_ref() {
                "check-updates" => host::check_for_updates(app.clone()),
                "sign-out" => {
                    // Clear native credentials, then let the web app run its own sign-out flow.
                    let broker = app.state::<auth::LoginBroker>();
                    broker.abandon();
                    if let Err(e) = auth::CredentialStore::clear(&auth::KeychainStore) {
                        eprintln!("keychain clear on sign-out failed: {e:?}");
                    }
                    let _ = app.emit("host://sign-out", ());
                }
                _ => {}
            });

            if let Some(hostname) = approved.host_str() {
                host::spawn_network_probe(app.handle().clone(), hostname.to_owned());
            }
            }

            let navigation_origin = approved.clone();
            // Web-session SSO leaves the app origin for the configured IdP and returns via its callback.
            let identity_provider = navigation::identity_provider_origin(option_env!("ELEVATEO_OIDC_ISSUER"));
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(approved.clone()))
                .title("Elevateo Mail")
                .inner_size(1120.0, 760.0)
                .initialization_script(&init_script(&approved.origin().ascii_serialization()))
                .on_navigation(move |url| navigation::is_approved_navigation(&navigation_origin, identity_provider.as_ref(), url))
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("native shell failed to start");
}
