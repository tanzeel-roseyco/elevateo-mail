use std::{io::{Read, Write}, process::{Command, Stdio}, thread, time::Duration};

// AIDEV-NOTE: Harmless test child; no user input, credentials, network or renderer entry point.
fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("exit") => (),
        Some("args") => println!("{}", serde_json::to_string(&std::env::args().skip(2).collect::<Vec<_>>()).unwrap()),
        Some("hang") => thread::sleep(Duration::from_secs(30)),
        Some("echo") => {
            let mut input = Vec::new();
            std::io::stdin().take(100_001).read_to_end(&mut input).unwrap();
            std::io::stdout().write_all(&input).unwrap();
            std::io::stderr().write_all(b"fixture-stderr").unwrap();
        }
        Some("flood") => {
            std::io::stdout().write_all(&vec![b'x'; 40_000]).unwrap();
            std::io::stderr().write_all(&vec![b'y'; 40_000]).unwrap();
        }
        Some("invalid-utf8") => std::io::stdout().write_all(&[0xff]).unwrap(),
        Some("held-output") => {
            let child = Command::new(std::env::current_exe().unwrap()).arg("hang").spawn().unwrap();
            drop(child);
        }
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
