#[path = "../bridge/mod.rs"]
mod bridge;

// AIDEV-NOTE: Local-user console handoff avoids exposing native process authority to remote browser origins.
#[cfg(windows)]
fn main() {
    use std::io::{self, BufRead};
    let result = (|| -> bridge::native_protocol::Result<_> {
        eprintln!("Paste the one-use Elevateo draft ticket JSON, then press Enter. No mail is sent.");
        let mut input = Vec::new();
        let mut reader = io::stdin().lock();
        loop {
            let chunk = reader.fill_buf().map_err(|_| "INPUT_FAILED")?;
            if chunk.is_empty() { break; }
            let size = chunk.iter().position(|b| *b == b'\n').map_or(chunk.len(), |n| n + 1);
            if input.len() + size > 1024 { return Err("INPUT_LIMIT"); }
            let ended = chunk[size - 1] == b'\n'; input.extend_from_slice(&chunk[..size]); reader.consume(size);
            if ended { break; }
        }
        let handoff = serde_json::from_slice(&input).map_err(|_| "INVALID_HANDOFF")?;
        let base = std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("ENVIRONMENT_MISSING")?).join("ElevateoMail");
        bridge::native_runtime::execute(&base, handoff)
    })();
    match result {
        Ok(draft) => println!("{}", serde_json::to_string(&draft).expect("Fixed draft DTO is serializable")),
        Err(code) => { eprintln!("Elevateo draft failed: {code}"); std::process::exit(1); }
    }
}
#[cfg(not(windows))]
fn main() { eprintln!("The contained CLI companion currently supports Windows only."); std::process::exit(1); }
