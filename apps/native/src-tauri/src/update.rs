// Auto-update guardrails around tauri-plugin-updater: a busy gate (never install over an unsaved
// draft or an in-flight send), a launch marker that records whether the first run after an update
// reached "ready", and a rollback that restores the archived previous bundle when it did not.
// The signed manifest itself is verified by the updater plugin with the public key injected at
// build time (ELEVATEO_UPDATER_PUBKEY); no key material lives in this module.
//
// AIDEV-NOTE: decision logic is pure and clock/fs-injected; lib.rs owns the thin fs/plugin wiring.
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// The next launch must report ready within this window or the update counts as failed.
pub const READY_WINDOW_SECS: u64 = 60;
/// Name of the archived previous bundle next to the live one.
pub const PREVIOUS_BUNDLE_NAME: &str = "Elevateo Mail.previous.app";
/// Launch marker file inside the app data directory.
pub const MARKER_FILE: &str = "update-launch-marker.json";

// ---- busy gate -------------------------------------------------------------------------------

/// Reported by the web UI through `host_report_busy`; both default to not busy.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BusyState {
    pub unsaved_draft: bool,
    pub send_in_progress: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallGate {
    Proceed,
    /// The web UI reports work an install would interrupt; ask again later, never force.
    BlockedBusy,
}

pub fn gate_install(busy: BusyState) -> InstallGate {
    if busy.unsaved_draft || busy.send_in_progress {
        InstallGate::BlockedBusy
    } else {
        InstallGate::Proceed
    }
}

/// Shared busy state the web UI updates and the update flow reads.
#[derive(Default)]
pub struct SharedBusy(pub Mutex<BusyState>);

// ---- launch marker and rollback decision -----------------------------------------------------

/// Written when an update installs; `ready` flips true when the web UI reports ready in time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaunchMarker {
    pub updated_to: String,
    pub installed_at_epoch_secs: u64,
    pub ready: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PostLaunchAction {
    /// No update is pending verification; nothing to do.
    None,
    /// Previous launch reached ready: keep this version, delete the marker and the archive.
    KeepAndCleanUp,
    /// Previous launch never reached ready and an archive exists: restore the previous bundle.
    Rollback,
    /// Previous launch failed but there is nothing to restore; keep running, clear the marker.
    FailedNoArchive,
}

/// Decides, at process start, what the previous launch's marker means.
pub fn post_launch_action(marker: Option<&LaunchMarker>, archive_exists: bool) -> PostLaunchAction {
    match marker {
        None => PostLaunchAction::None,
        Some(m) if m.ready => PostLaunchAction::KeepAndCleanUp,
        Some(_) if archive_exists => PostLaunchAction::Rollback,
        Some(_) => PostLaunchAction::FailedNoArchive,
    }
}

// ---- marker persistence (thin, path-injected) -------------------------------------------------

pub fn read_marker(dir: &Path) -> Option<LaunchMarker> {
    let raw = fs::read_to_string(dir.join(MARKER_FILE)).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn write_marker(dir: &Path, marker: &LaunchMarker) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    fs::write(dir.join(MARKER_FILE), serde_json::to_vec(marker).expect("marker serializes"))
}

pub fn clear_marker(dir: &Path) -> std::io::Result<()> {
    match fs::remove_file(dir.join(MARKER_FILE)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

/// Marks the current marker ready (the web UI reached its signed-in or sign-in screen).
pub fn mark_ready(dir: &Path) -> std::io::Result<()> {
    if let Some(mut marker) = read_marker(dir) {
        marker.ready = true;
        write_marker(dir, &marker)?;
    }
    Ok(())
}

// ---- bundle archive / restore -----------------------------------------------------------------

/// Where the previous bundle is archived, inside the app data dir (user-writable, survives update).
pub fn archive_path(data_dir: &Path) -> PathBuf {
    data_dir.join(PREVIOUS_BUNDLE_NAME)
}

/// Copies the currently installed .app aside before the updater replaces it.
/// A copy (not a rename) keeps the running bundle in place if the install is aborted.
pub fn archive_current_bundle(app_bundle: &Path, archive: &Path) -> std::io::Result<()> {
    if archive.exists() {
        fs::remove_dir_all(archive)?;
    }
    copy_dir_recursive(app_bundle, archive)
}

/// Restores the archived bundle over a failed update: the broken bundle is moved aside first so a
/// failed restore cannot leave zero bundles on disk.
pub fn restore_previous_bundle(app_bundle: &Path, archive: &Path) -> std::io::Result<()> {
    let failed = app_bundle.with_extension("failed-update");
    if failed.exists() {
        fs::remove_dir_all(&failed)?;
    }
    fs::rename(app_bundle, &failed)?;
    match fs::rename(archive, app_bundle) {
        Ok(()) => {
            fs::remove_dir_all(&failed)?;
            Ok(())
        }
        Err(e) => {
            // Put the failed bundle back so the user still has a launchable (if broken) app.
            let _ = fs::rename(&failed, app_bundle);
            Err(e)
        }
    }
}

fn copy_dir_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else if file_type.is_symlink() {
            // .app bundles contain symlinks (frameworks); preserve them instead of flattening.
            #[cfg(unix)]
            {
                let link = fs::read_link(entry.path())?;
                std::os::unix::fs::symlink(link, &target)?;
            }
            #[cfg(not(unix))]
            {
                fs::copy(entry.path(), &target)?;
            }
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn marker(ready: bool) -> LaunchMarker {
        LaunchMarker { updated_to: "0.2.0".into(), installed_at_epoch_secs: 1_700_000_000, ready }
    }

    #[test]
    fn healthy_previous_launch_keeps_the_update() {
        assert_eq!(post_launch_action(Some(&marker(true)), true), PostLaunchAction::KeepAndCleanUp);
        assert_eq!(post_launch_action(Some(&marker(true)), false), PostLaunchAction::KeepAndCleanUp);
    }

    #[test]
    fn failed_health_check_rolls_back_when_an_archive_exists() {
        assert_eq!(post_launch_action(Some(&marker(false)), true), PostLaunchAction::Rollback);
    }

    #[test]
    fn failed_health_check_without_archive_cannot_roll_back() {
        assert_eq!(post_launch_action(Some(&marker(false)), false), PostLaunchAction::FailedNoArchive);
    }

    #[test]
    fn no_marker_means_nothing_pending() {
        assert_eq!(post_launch_action(None, true), PostLaunchAction::None);
    }

    #[test]
    fn install_is_blocked_while_a_draft_is_unsaved_or_a_send_is_in_progress() {
        assert_eq!(gate_install(BusyState { unsaved_draft: true, send_in_progress: false }), InstallGate::BlockedBusy);
        assert_eq!(gate_install(BusyState { unsaved_draft: false, send_in_progress: true }), InstallGate::BlockedBusy);
        assert_eq!(gate_install(BusyState { unsaved_draft: true, send_in_progress: true }), InstallGate::BlockedBusy);
    }

    #[test]
    fn install_proceeds_when_idle() {
        assert_eq!(gate_install(BusyState::default()), InstallGate::Proceed);
    }

    #[test]
    fn marker_round_trips_and_mark_ready_flips_the_flag() {
        let dir = tempdir();
        assert_eq!(read_marker(&dir), None);
        write_marker(&dir, &marker(false)).unwrap();
        assert_eq!(read_marker(&dir), Some(marker(false)));
        mark_ready(&dir).unwrap();
        assert_eq!(read_marker(&dir), Some(marker(true)));
        clear_marker(&dir).unwrap();
        assert_eq!(read_marker(&dir), None);
        clear_marker(&dir).unwrap(); // idempotent
    }

    #[test]
    fn restore_swaps_archive_into_place_and_discards_failed_bundle() {
        let root = tempdir();
        let bundle = root.join("Elevateo Mail.app");
        let archive = root.join(PREVIOUS_BUNDLE_NAME);
        fs::create_dir_all(&bundle).unwrap();
        fs::write(bundle.join("version"), "broken").unwrap();
        fs::create_dir_all(&archive).unwrap();
        fs::write(archive.join("version"), "good").unwrap();
        restore_previous_bundle(&bundle, &archive).unwrap();
        assert_eq!(fs::read_to_string(bundle.join("version")).unwrap(), "good");
        assert!(!archive.exists());
        assert!(!bundle.with_extension("failed-update").exists());
    }

    fn tempdir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("elevateo-update-test-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
