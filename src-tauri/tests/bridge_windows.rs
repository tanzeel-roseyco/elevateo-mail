#![cfg(all(windows, feature = "containment-fixtures"))]
#[path = "../src/bridge/mod.rs"]
mod bridge;
use bridge::windows::{FixtureJob, FixtureMode};
use bridge::io::FixtureIo;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::{path::{Path, PathBuf}, thread, time::{Duration, Instant}};

#[test]
fn production_pipe_transport_echoes_without_staging_mail() {
    let cwd = std::env::temp_dir();
    let result = bridge::cli_process::run(&fixture(), &["echo".into()], &[0, 0], &cwd,
        b"fixture-only input".to_vec(), Duration::from_secs(2)).unwrap();
    assert_eq!(result.stdout, "fixture-only input");
}
#[test]
fn production_pipe_transport_kills_stalled_reader_and_limits_output() {
    let cwd = std::env::temp_dir();
    assert!(bridge::cli_process::run(&fixture(), &["hang".into()], &[0, 0], &cwd,
        vec![b'x'; 100_000], Duration::from_millis(100)).is_err());
    assert!(bridge::cli_process::run(&fixture(), &["flood".into()], &[0, 0], &cwd,
        vec![], Duration::from_secs(2)).is_err());
}

#[test]
fn production_arguments_roundtrip_empty_quotes_backslashes_and_shell_characters() {
    let values = vec![String::new(), "quoted\"value".into(), "C:\\path with space\\".into(), "$(ignored)&|%x%".into()];
    let mut args = vec!["args".into()]; args.extend(values.clone());
    let output = bridge::cli_process::run(&fixture(), &args, &[0, 0], &std::env::temp_dir(),
        vec![], Duration::from_secs(2)).unwrap();
    assert_eq!(serde_json::from_str::<Vec<String>>(&output.stdout).unwrap(), values);
}
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

#[test]
fn io_captures_both_streams_and_can_reuse_after_success() {
    let mut io = FixtureIo::default();
    for _ in 0..2 {
        let output = io.run(&fixture(), FixtureMode::Echo, b"bounded input", &AtomicBool::new(false), Duration::from_secs(5)).unwrap();
        assert_eq!(output.stdout, "bounded input");
        assert_eq!(output.stderr, "fixture-stderr");
    }
}
#[test]
fn io_rejects_combined_overflow_and_invalid_utf8() {
    let mut io = FixtureIo::default();
    for (mode, error) in [(FixtureMode::Flood, "OUTPUT_LIMIT"), (FixtureMode::InvalidUtf8, "INVALID_UTF8")] {
        let result = io.run(&fixture(), mode, b"", &AtomicBool::new(false), Duration::from_secs(5));
        assert_eq!(result.err().unwrap().to_string(), error);
    }
    assert!(io.run(&fixture(), FixtureMode::Exit, b"", &AtomicBool::new(false), Duration::from_secs(5)).is_ok());
}
#[test]
fn io_stalled_input_times_out_and_descendant_pipe_cannot_hang() {
    let mut io = FixtureIo::default();
    let began = Instant::now();
    let result = io.run(&fixture(), FixtureMode::Hang, &vec![b'x'; 100_000], &AtomicBool::new(false), Duration::from_millis(100));
    assert_eq!(result.err().unwrap().to_string(), "TIMEOUT");
    assert!(began.elapsed() < Duration::from_secs(7));
    assert!(io.run(&fixture(), FixtureMode::HeldOutput, b"", &AtomicBool::new(false), Duration::from_secs(5)).is_ok());
}
#[test]
fn io_cancel_and_invalid_input_do_not_spawn_or_poison() {
    let mut io = FixtureIo::default();
    let cancel = Arc::new(AtomicBool::new(false));
    let signal = cancel.clone();
    let cancel_thread = thread::spawn(move || { thread::sleep(Duration::from_millis(100)); signal.store(true, Ordering::Release); });
    assert_eq!(io.run(&fixture(), FixtureMode::Hang, b"", &cancel, Duration::from_secs(5)).err().unwrap().to_string(), "CANCELLED");
    cancel_thread.join().unwrap();
    assert_eq!(io.run(Path::new("missing"), FixtureMode::Exit, &vec![0; 100_001], &AtomicBool::new(false), Duration::from_secs(5)).err().unwrap().to_string(), "INPUT_LIMIT");
    assert!(io.run(&fixture(), FixtureMode::Exit, b"", &AtomicBool::new(false), Duration::from_secs(5)).is_ok());
}
#[test]
fn io_unknown_start_permanently_poisoned() {
    let mut io = FixtureIo::default();
    assert!(io.run(Path::new("missing"), FixtureMode::Exit, b"", &AtomicBool::new(false), Duration::from_secs(5)).is_err());
    assert_eq!(io.run(&fixture(), FixtureMode::Exit, b"", &AtomicBool::new(false), Duration::from_secs(5)).err().unwrap().to_string(), "TERMINATION_UNCONFIRMED");
}
