// Auto-update guardrails around tauri-plugin-updater: a busy gate (never install over an unsaved
// draft or an in-flight send, nor before the web UI has reported its state), a phased launch marker
// that gives the updated version one full launch to reach "ready", and a rollback that restores the
// archived previous bundle when that launch never did.
// The signed manifest itself is verified by the updater plugin with the public key injected at
// build time (ELEVATEO_UPDATER_PUBKEY); no key material lives in this module.
//
// AIDEV-NOTE: decision logic is pure and fs-injected; host.rs/lib.rs own the thin plugin wiring.
// Lifecycle: install ok -> Installed; next start -> Launched; web host_ready -> Ready;
// following start: Ready keeps the update, Launched (never ready) rolls back.
// There is deliberately no wall-clock deadline: "never reached ready during its launch" is the
// failure signal, so a slow-but-healthy first start is not rolled back (design review #1).
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Name of the archived previous bundle inside the app data directory.
pub const PREVIOUS_BUNDLE_NAME: &str = "Elevateo Mail.previous.app";
/// Launch marker file inside the app data directory.
pub const MARKER_FILE: &str = "update-launch-marker.json";

// ---- busy gate -------------------------------------------------------------------------------

/// Reported by the web UI through `host_report_busy`.
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
    /// The web UI has not (completely) reported yet; unknown is treated as busy.
    BlockedUnknown,
}

pub fn gate_install(busy: Option<BusyState>) -> InstallGate {
    match busy {
        None => InstallGate::BlockedUnknown,
        Some(b) if b.unsaved_draft || b.send_in_progress => InstallGate::BlockedBusy,
        Some(_) => InstallGate::Proceed,
    }
}

/// Shared busy state the web UI updates and the update flow reads. `None` until the web UI has
/// sent a complete report (every busy source spoke at least once).
#[derive(Default)]
pub struct SharedBusy(pub Mutex<Option<BusyState>>);

// ---- launch marker and rollback decision -----------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarkerPhase {
    /// The install succeeded; the updated version has not started yet.
    Installed,
    /// The updated version started and has not yet reported a meaningful screen.
    Launched,
    /// The updated version reported ready during its launch.
    Ready,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaunchMarker {
    pub updated_to: String,
    pub phase: MarkerPhase,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PostLaunchAction {
    /// No update is pending verification; nothing to do.
    None,
    /// First start of a freshly installed update: record the launch, then let it try to get ready.
    BeginHealthCheck,
    /// Previous launch reached ready: keep this version, delete the marker and the archive.
    KeepAndCleanUp,
    /// Previous launch never reached ready and an archive exists: restore the previous bundle.
    Rollback,
    /// Previous launch failed but there is nothing to restore; keep running, clear the marker.
    FailedNoArchive,
}

/// Decides, at process start, what the marker left by earlier launches means.
pub fn post_launch_action(marker: Option<&LaunchMarker>, archive_exists: bool) -> PostLaunchAction {
    match marker.map(|m| m.phase) {
        None => PostLaunchAction::None,
        Some(MarkerPhase::Installed) => PostLaunchAction::BeginHealthCheck,
        Some(MarkerPhase::Ready) => PostLaunchAction::KeepAndCleanUp,
        Some(MarkerPhase::Launched) if archive_exists => PostLaunchAction::Rollback,
        Some(MarkerPhase::Launched) => PostLaunchAction::FailedNoArchive,
    }
}

// ---- marker persistence (thin, path-injected) -------------------------------------------------

/// Only a missing file means "no marker"; unreadable or corrupt markers are errors the caller must
/// surface, never a silent "nothing pending" that would skip recovery.
pub fn read_marker(dir: &Path) -> io::Result<Option<LaunchMarker>> {
    let raw = match fs::read_to_string(dir.join(MARKER_FILE)) {
        Ok(raw) => raw,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("update marker is corrupt: {e}")))
}

pub fn write_marker(dir: &Path, marker: &LaunchMarker) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let bytes = serde_json::to_vec(marker).map_err(io::Error::other)?;
    // Write-then-rename so a crash mid-write cannot leave a truncated marker.
    let staging = dir.join(format!("{MARKER_FILE}.tmp"));
    fs::write(&staging, bytes)?;
    fs::rename(staging, dir.join(MARKER_FILE))
}

pub fn clear_marker(dir: &Path) -> io::Result<()> {
    match fs::remove_file(dir.join(MARKER_FILE)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

/// Moves the marker to `to` only when it is currently in `from`; returns whether it moved.
fn advance_marker(dir: &Path, from: MarkerPhase, to: MarkerPhase) -> io::Result<bool> {
    match read_marker(dir)? {
        Some(mut marker) if marker.phase == from => {
            marker.phase = to;
            write_marker(dir, &marker)?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

/// Startup of a freshly installed update: from now on, not reaching ready means rollback.
pub fn mark_launched(dir: &Path) -> io::Result<bool> {
    advance_marker(dir, MarkerPhase::Installed, MarkerPhase::Launched)
}

/// The web UI reached its signed-in or sign-in screen. Only a launched update can become ready:
/// the old process (still running after an install, marker `Installed`) cannot certify the new one.
pub fn mark_ready(dir: &Path) -> io::Result<bool> {
    advance_marker(dir, MarkerPhase::Launched, MarkerPhase::Ready)
}

// ---- bundle archive / restore -----------------------------------------------------------------

/// Where the previous bundle is archived, inside the app data dir (user-writable, survives update).
pub fn archive_path(data_dir: &Path) -> PathBuf {
    data_dir.join(PREVIOUS_BUNDLE_NAME)
}

/// Copies the currently installed .app aside before the updater replaces it.
/// A copy (not a rename) keeps the running bundle in place if the install is aborted.
pub fn archive_current_bundle(app_bundle: &Path, archive: &Path) -> io::Result<()> {
    remove_dir_if_present(archive)?;
    copy_dir_recursive(app_bundle, archive)
}

/// Restores the archived bundle over a failed update.
///
/// The archive may live on another volume than the installed bundle, so it is first COPIED into a
/// staging directory beside the bundle; the swap then uses same-volume renames only. The broken
/// bundle is moved aside before the staged copy moves in, so a failure at any step leaves one
/// launchable bundle in place, and the archive is deleted only after the restore succeeded.
pub fn restore_previous_bundle(app_bundle: &Path, archive: &Path) -> io::Result<()> {
    let staging = app_bundle.with_extension("restore-staging");
    let failed = app_bundle.with_extension("failed-update");
    remove_dir_if_present(&staging)?;
    remove_dir_if_present(&failed)?;
    if let Err(e) = copy_dir_recursive(archive, &staging) {
        // Best-effort removal of a partial copy; the original error is the one that matters.
        if let Err(cleanup) = remove_dir_if_present(&staging) {
            eprintln!("could not remove partial restore staging: {cleanup}");
        }
        return Err(e);
    }
    fs::rename(app_bundle, &failed)?;
    if let Err(e) = fs::rename(&staging, app_bundle) {
        // Put the failed bundle back so the person still has a launchable (if broken) app.
        if let Err(undo) = fs::rename(&failed, app_bundle) {
            eprintln!("restore failed and the updated bundle could not be put back: {undo}");
        }
        return Err(e);
    }
    remove_dir_if_present(&failed)?;
    remove_dir_if_present(archive)
}

pub fn remove_dir_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

fn copy_dir_recursive(from: &Path, to: &Path) -> io::Result<()> {
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

    fn marker(phase: MarkerPhase) -> LaunchMarker {
        LaunchMarker { updated_to: "0.2.0".into(), phase }
    }

    /// Simulates one process start the way lib.rs does it and returns the decision taken.
    fn start(dir: &Path, archive_exists: bool) -> PostLaunchAction {
        let action = post_launch_action(read_marker(dir).unwrap().as_ref(), archive_exists);
        if action == PostLaunchAction::BeginHealthCheck {
            assert!(mark_launched(dir).unwrap());
        }
        action
    }

    #[test]
    fn healthy_update_gets_its_first_launch_and_is_kept_after_reporting_ready() {
        let dir = tempdir("healthy");
        write_marker(&dir, &marker(MarkerPhase::Installed)).unwrap();
        // The old process is still running after install: its readiness must not certify the update.
        assert!(!mark_ready(&dir).unwrap());
        assert_eq!(start(&dir, true), PostLaunchAction::BeginHealthCheck);
        assert!(mark_ready(&dir).unwrap());
        assert_eq!(start(&dir, true), PostLaunchAction::KeepAndCleanUp);
    }

    #[test]
    fn update_that_never_reaches_ready_rolls_back_on_the_following_start() {
        let dir = tempdir("unhealthy");
        write_marker(&dir, &marker(MarkerPhase::Installed)).unwrap();
        assert_eq!(start(&dir, true), PostLaunchAction::BeginHealthCheck);
        assert_eq!(start(&dir, true), PostLaunchAction::Rollback);
    }

    #[test]
    fn failed_launch_without_archive_cannot_roll_back() {
        assert_eq!(post_launch_action(Some(&marker(MarkerPhase::Launched)), false), PostLaunchAction::FailedNoArchive);
        assert_eq!(post_launch_action(None, true), PostLaunchAction::None);
    }

    #[test]
    fn corrupt_or_unreadable_marker_is_an_error_not_absence() {
        let dir = tempdir("corrupt");
        assert_eq!(read_marker(&dir).unwrap(), None);
        fs::write(dir.join(MARKER_FILE), "{\"updated_to\":").unwrap();
        assert_eq!(read_marker(&dir).unwrap_err().kind(), io::ErrorKind::InvalidData);
        assert!(mark_ready(&dir).is_err(), "readiness must not report success over a corrupt marker");
        // A directory where the file should be is unreadable as a marker, not "no update pending".
        fs::remove_file(dir.join(MARKER_FILE)).unwrap();
        fs::create_dir(dir.join(MARKER_FILE)).unwrap();
        assert!(read_marker(&dir).is_err());
    }

    #[test]
    fn marker_clear_is_idempotent() {
        let dir = tempdir("clear");
        write_marker(&dir, &marker(MarkerPhase::Ready)).unwrap();
        clear_marker(&dir).unwrap();
        clear_marker(&dir).unwrap();
        assert_eq!(read_marker(&dir).unwrap(), None);
    }

    #[test]
    fn install_is_blocked_while_busy_or_before_the_web_ui_reported() {
        assert_eq!(gate_install(None), InstallGate::BlockedUnknown);
        assert_eq!(gate_install(Some(BusyState { unsaved_draft: true, send_in_progress: false })), InstallGate::BlockedBusy);
        assert_eq!(gate_install(Some(BusyState { unsaved_draft: false, send_in_progress: true })), InstallGate::BlockedBusy);
        assert_eq!(gate_install(Some(BusyState::default())), InstallGate::Proceed);
    }

    #[test]
    fn restore_copies_from_a_separate_archive_location_and_cleans_up() {
        let root = tempdir("restore");
        let bundle = root.join("apps").join("Elevateo Mail.app");
        // Archive in a different tree, as on a different volume: the restore must not rename it.
        let archive = root.join("data").join(PREVIOUS_BUNDLE_NAME);
        fs::create_dir_all(&bundle).unwrap();
        fs::write(bundle.join("version"), "broken").unwrap();
        fs::create_dir_all(archive.join("Contents")).unwrap();
        fs::write(archive.join("Contents").join("version"), "good").unwrap();
        restore_previous_bundle(&bundle, &archive).unwrap();
        assert_eq!(fs::read_to_string(bundle.join("Contents").join("version")).unwrap(), "good");
        assert!(!bundle.join("version").exists());
        assert!(!archive.exists());
        assert!(!bundle.with_extension("failed-update").exists());
        assert!(!bundle.with_extension("restore-staging").exists());
    }

    #[test]
    fn failed_restore_keeps_the_current_bundle_and_leaves_no_staging() {
        let root = tempdir("restore-fail");
        let bundle = root.join("Elevateo Mail.app");
        fs::create_dir_all(&bundle).unwrap();
        fs::write(bundle.join("version"), "current").unwrap();
        let missing_archive = root.join("absent").join(PREVIOUS_BUNDLE_NAME);
        assert!(restore_previous_bundle(&bundle, &missing_archive).is_err());
        assert_eq!(fs::read_to_string(bundle.join("version")).unwrap(), "current");
        assert!(!bundle.with_extension("restore-staging").exists());
    }

    fn tempdir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("elevateo-update-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
