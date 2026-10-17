#![cfg(all(windows, feature = "containment-fixtures"))]
#[path = "../src/bridge/mod.rs"]
mod bridge;
use bridge::windows::{FixtureJob, FixtureMode};
use std::{path::{Path, PathBuf}, thread, time::{Duration, Instant}};

// AIDEV-NOTE: Real Windows kernel tests; Linux cfg exclusion is not successful containment validation.
fn fixture() -> PathBuf {
    // AIDEV-NOTE: Cross-compiled tests carry a Linux build path; packaged fixture is their trusted sibling.
    let sibling = std::env::current_exe().unwrap().parent().unwrap().join("bridge-fixture.exe");
    if sibling.is_file() { sibling } else { PathBuf::from(env!("CARGO_BIN_EXE_bridge-fixture")) }
}
fn wait_until(mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !condition() {
        assert!(Instant::now() < deadline, "fixture condition timed out");
        thread::sleep(Duration::from_millis(10));
    }
}
#[test]
fn stops_running_process_and_confirms_empty_job() {
    let job = FixtureJob::start(&fixture(), FixtureMode::Hang).unwrap();
    assert_eq!(job.active_processes().unwrap(), 1);
    job.stop().unwrap();
    assert_eq!(job.active_processes().unwrap(), 0);
}
#[test]
fn root_exit_does_not_hide_live_descendant() {
    let job = FixtureJob::start(&fixture(), FixtureMode::Descendant).unwrap();
    wait_until(|| job.root_exited());
    // AIDEV-NOTE: Windows may add console helper processes; assert a live tree, not its exact size.
    assert!(job.active_processes().unwrap() >= 1);
    job.stop().unwrap();
    assert_eq!(job.active_processes().unwrap(), 0);
}
#[test]
fn normal_exit_can_be_cleaned_up() {
    let job = FixtureJob::start(&fixture(), FixtureMode::Exit).unwrap();
    wait_until(|| job.root_exited());
    job.stop().unwrap();
    assert_eq!(job.active_processes().unwrap(), 0);
}
#[test]
fn rejects_missing_executable() {
    assert!(FixtureJob::start(Path::new("missing-bridge-fixture.exe"), FixtureMode::Exit).is_err());
}



