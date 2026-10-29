use std::{process::{Command, Stdio}, thread, time::Duration};

// AIDEV-NOTE: Harmless test child; no user input, credentials, network or renderer entry point.
fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("exit") => (),
        Some("hang") => thread::sleep(Duration::from_secs(30)),
        Some("descendant") => {
            let child = Command::new(std::env::current_exe().expect("fixture path"))
                .arg("hang").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
                .spawn().expect("fixture descendant");
            // Root exits intentionally: the harness must still find and terminate the descendant.
            drop(child);
        }
        _ => std::process::exit(2),
    }
}
