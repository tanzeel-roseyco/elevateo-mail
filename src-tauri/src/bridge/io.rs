use super::windows::{FixtureJob, FixtureMode};
use std::{fs::{File, OpenOptions}, io::{self, Read, Seek, SeekFrom, Write}, os::windows::{fs::OpenOptionsExt, io::{AsRawHandle, FromRawHandle}}, path::Path, sync::atomic::{AtomicBool, AtomicU64, Ordering}, thread, time::{Duration, Instant}};
use windows_sys::Win32::{Foundation::{SetHandleInformation, ERROR_BROKEN_PIPE, HANDLE_FLAG_INHERIT}, System::Pipes::{CreatePipe, PeekNamedPipe}};

const INPUT_LIMIT: usize = 100_000;
const OUTPUT_LIMIT: usize = 64_000;
static INPUT_SEQUENCE: AtomicU64 = AtomicU64::new(0);
fn failure(message: &str) -> io::Error { io::Error::other(message) }
pub(super) fn pipe() -> io::Result<(File, File)> {
    let (mut read, mut write) = (std::ptr::null_mut(), std::ptr::null_mut());
    if unsafe { CreatePipe(&mut read, &mut write, std::ptr::null(), 0) } == 0 { return Err(io::Error::last_os_error()); }
    Ok(unsafe { (File::from_raw_handle(read), File::from_raw_handle(write)) })
}
pub(super) fn inheritable(file: &File) -> io::Result<()> {
    if unsafe { SetHandleInformation(file.as_raw_handle(), HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}
fn input_file(input: &[u8]) -> io::Result<File> {
    // AIDEV-NOTE: Fixture-only delete-on-close stdin avoids blocking writers; never stage real mail through this harness.
    let sequence = INPUT_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!("elevateo-fixture-{}-{sequence}.stdin", std::process::id()));
    let mut file = OpenOptions::new().read(true).write(true).create_new(true).share_mode(0)
        .custom_flags(0x04000000).open(path)?; // FILE_FLAG_DELETE_ON_CLOSE
    file.write_all(input)?;
    file.seek(SeekFrom::Start(0))?;
    Ok(file)
}
pub(super) fn drain(file: &mut File, bytes: &mut Vec<u8>, total: &mut usize) -> io::Result<bool> {
    let mut available = 0;
    if unsafe { PeekNamedPipe(file.as_raw_handle(), std::ptr::null_mut(), 0, std::ptr::null_mut(), &mut available, std::ptr::null_mut()) } == 0 {
        let error = io::Error::last_os_error();
        if error.raw_os_error() == Some(ERROR_BROKEN_PIPE as i32) { return Ok(true); }
        return Err(error);
    }
    if available == 0 { return Ok(false); }
    // AIDEV-NOTE: One bounded read per stream per tick prevents an endless stdout producer starving stderr/cancellation.
    let mut chunk = [0u8; 4096];
    let count = file.read(&mut chunk[..(available as usize).min(4096)])?;
    *total += count;
    if *total > OUTPUT_LIMIT { return Err(failure("OUTPUT_LIMIT")); }
    bytes.extend_from_slice(&chunk[..count]);
    Ok(false)
}
pub struct FixtureOutput { pub stdout: String, pub stderr: String }
#[derive(Default)]
pub struct FixtureIo { poisoned: bool }
impl FixtureIo {
    // AIDEV-NOTE: Exclusive mutable access permits one job; startup/cleanup ambiguity permanently poisons this instance.
    pub fn run(&mut self, executable: &Path, mode: FixtureMode, input: &[u8], cancel: &AtomicBool, deadline: Duration) -> io::Result<FixtureOutput> {
        if self.poisoned { return Err(failure("TERMINATION_UNCONFIRMED")); }
        if input.len() > INPUT_LIMIT { return Err(failure("INPUT_LIMIT")); }
        if deadline.is_zero() || deadline > Duration::from_secs(60) { return Err(failure("INVALID_DEADLINE")); }
        if cancel.load(Ordering::Acquire) { return Err(failure("CANCELLED")); }
        let until = Instant::now() + deadline;
        let stdin = input_file(input)?;
        let (mut stdout, child_stdout) = pipe()?;
        let (mut stderr, child_stderr) = pipe()?;
        for file in [&stdin, &child_stdout, &child_stderr] { inheritable(file)?; }
        let job = match FixtureJob::start_with_handles(executable, mode,
            Some([stdin.as_raw_handle(), child_stdout.as_raw_handle(), child_stderr.as_raw_handle()])) {
            Ok(job) => job,
            Err(error) => { self.poisoned = true; return Err(error); }
        };
        drop(stdin); drop(child_stdout); drop(child_stderr);
        let (mut out, mut err, mut total) = (Vec::new(), Vec::new(), 0);
        let result = (|| {
            loop {
                if cancel.load(Ordering::Acquire) { return Err(failure("CANCELLED")); }
                if Instant::now() >= until { return Err(failure("TIMEOUT")); }
                drain(&mut stdout, &mut out, &mut total)?;
                drain(&mut stderr, &mut err, &mut total)?;
                if job.root_exited() {
                    if job.exit_code()? != 0 { return Err(failure("PROCESS_FAILED")); }
                    break;
                }
                thread::sleep(Duration::from_millis(2));
            }
            Ok(())
        })();
        // Root exit never proves pipe EOF: terminate descendants before bounded final draining.
        if let Err(error) = job.stop() { self.poisoned = true; return Err(error); }
        result?;
        let cleanup_until = Instant::now() + Duration::from_secs(1);
        loop {
            let out_done = drain(&mut stdout, &mut out, &mut total)?;
            let err_done = drain(&mut stderr, &mut err, &mut total)?;
            if out_done && err_done { break; }
            if Instant::now() >= cleanup_until { return Err(failure("PIPE_CLEANUP_TIMEOUT")); }
            thread::sleep(Duration::from_millis(2));
        }
        Ok(FixtureOutput { stdout: String::from_utf8(out).map_err(|_| failure("INVALID_UTF8"))?,
            stderr: String::from_utf8(err).map_err(|_| failure("INVALID_UTF8"))? })
    }
}
