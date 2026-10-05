use super::{io::{pipe, inheritable, drain, FixtureOutput}, windows::FixtureJob};
use std::{io::{self, Write}, os::windows::io::AsRawHandle, path::Path, thread, time::{Duration, Instant}};

// AIDEV-NOTE: Real mail stays in anonymous pipes; installed CLI/admin policy is trusted, not an OS sandbox.
pub fn run(executable: &Path, args: &[String], environment: &[u16], cwd: &Path,
    input: Vec<u8>, deadline: Duration) -> io::Result<FixtureOutput> {
    if input.len() > 100_000 || deadline.is_zero() || deadline > Duration::from_secs(60) {
        return Err(io::Error::other("INVALID_LIMIT"));
    }
    let until = Instant::now() + deadline;
    let (child_stdin, mut stdin) = pipe()?;
    let (mut stdout, child_stdout) = pipe()?;
    let (mut stderr, child_stderr) = pipe()?;
    for handle in [&child_stdin, &child_stdout, &child_stderr] { inheritable(handle)?; }
    let job = FixtureJob::start_command(executable, args, environment, Some(cwd),
        Some([child_stdin.as_raw_handle(), child_stdout.as_raw_handle(), child_stderr.as_raw_handle()]), 512 * 1024 * 1024)?;
    drop(child_stdin); drop(child_stdout); drop(child_stderr);
    let writer = thread::spawn(move || stdin.write_all(&input));
    let (mut out, mut err, mut total) = (Vec::new(), Vec::new(), 0);
    let result = (|| {
        loop {
            if Instant::now() >= until { return Err(io::Error::other("TIMEOUT")); }
            drain(&mut stdout, &mut out, &mut total)?; drain(&mut stderr, &mut err, &mut total)?;
            if job.root_exited() {
                if job.exit_code()? != 0 { return Err(io::Error::other("PROCESS_FAILED")); }
                return Ok(());
            }
            thread::sleep(Duration::from_millis(5));
        }
    })();
    // Killing every pipe reader unblocks the writer; never return a draft before confirmed tree cleanup.
    job.stop()?;
    let written = writer.join().map_err(|_| io::Error::other("INPUT_FAILED"))?;
    result?; written?;
    let cleanup = Instant::now() + Duration::from_secs(1);
    loop {
        let out_done = drain(&mut stdout, &mut out, &mut total)?;
        let err_done = drain(&mut stderr, &mut err, &mut total)?;
        if out_done && err_done { break; }
        if Instant::now() >= cleanup { return Err(io::Error::other("PIPE_CLEANUP_TIMEOUT")); }
        thread::sleep(Duration::from_millis(5));
    }
    Ok(FixtureOutput { stdout: String::from_utf8(out).map_err(|_| io::Error::other("INVALID_UTF8"))?,
        stderr: String::from_utf8(err).map_err(|_| io::Error::other("INVALID_UTF8"))? })
}
