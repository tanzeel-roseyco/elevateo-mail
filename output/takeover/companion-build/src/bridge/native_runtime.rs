use super::{cli_process, native_protocol::*};
use sha2::{Digest, Sha256};
use std::{fs::{File, OpenOptions}, io::Read, os::windows::fs::OpenOptionsExt, path::{Path, PathBuf}, time::Duration};

fn read_bounded(mut reader: impl Read, max: usize) -> Result<Vec<u8>> {
    let mut bytes = Vec::new(); reader.by_ref().take(max as u64 + 1).read_to_end(&mut bytes).map_err(|_| "READ_FAILED")?;
    if bytes.len() > max { return Err("BODY_LIMIT"); } Ok(bytes)
}
fn post<T: serde::de::DeserializeOwned>(client: &reqwest::blocking::Client, origin: &str, path: &str,
    body: serde_json::Value) -> Result<T> {
    let response = client.post(format!("{}{path}", origin.trim_end_matches('/'))).json(&body).send().map_err(|_| "SERVER_UNAVAILABLE")?;
    if !response.status().is_success() { return Err("SERVER_DENIED"); }
    serde_json::from_slice(&read_bounded(response, 100_000)?).map_err(|_| "INVALID_SERVER_RESPONSE")
}
fn environment(config: &LocalConfig) -> Result<Vec<u16>> {
    // AIDEV-NOTE: Excludes API keys, proxy settings, NODE_OPTIONS, PATH and CLI environment overrides.
    let mut entries = Vec::new();
    for name in ["SystemRoot", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"] {
        let value = std::env::var(name).map_err(|_| "ENVIRONMENT_MISSING")?;
        if value.contains('\0') { return Err("INVALID_ENVIRONMENT"); }
        entries.push(format!("{name}={value}"));
    }
    entries.push(format!("CLAUDE_CONFIG_DIR={}", config.claude_config_dir));
    entries.sort_by_key(|entry| entry.to_ascii_lowercase());
    Ok(entries.into_iter().flat_map(|value| value.encode_utf16().chain(Some(0)).collect::<Vec<_>>()).chain(Some(0)).collect())
}
fn pinned_executable(config: &LocalConfig) -> Result<(PathBuf, File)> {
    let path = PathBuf::from(&config.executable).canonicalize().map_err(|_| "EXECUTABLE_MISSING")?;
    if path.file_name().and_then(|v| v.to_str()) != Some("claude.exe") { return Err("EXECUTABLE_INVALID"); }
    // Deny ordinary Windows file replacement/writes while hashing and executing the locally trusted installation.
    let mut file = OpenOptions::new().read(true).share_mode(1).open(&path).map_err(|_| "EXECUTABLE_LOCK_FAILED")?;
    if file.metadata().map_err(|_| "EXECUTABLE_INVALID")?.len() > 1_000_000_000 { return Err("EXECUTABLE_INVALID"); }
    let mut digest = Sha256::new(); let mut chunk = [0; 65536];
    loop {
        let count = file.read(&mut chunk).map_err(|_| "EXECUTABLE_READ_FAILED")?;
        if count == 0 { break; } digest.update(&chunk[..count]);
    }
    if format!("{:x}", digest.finalize()) != config.sha256 { return Err("EXECUTABLE_CHANGED"); }
    Ok((path, file))
}
pub fn execute(base: &Path, handoff: Handoff) -> Result<DraftResult> {
    let config: LocalConfig = serde_json::from_slice(&read_bounded(File::open(base.join("native-cli.json"))
        .map_err(|_| "LOCAL_SETUP_REQUIRED")?, 16_384)?).map_err(|_| "INVALID_CONFIG")?;
    validate_config(&config)?; validate_handoff(&handoff, now()?)?;
    if !Path::new(&config.claude_config_dir).is_absolute() || !Path::new(&config.claude_config_dir).is_dir()
        || config.claude_config_dir.contains('\0') { return Err("INVALID_PROFILE"); }
    // AIDEV-NOTE: Share-mode zero gives one active companion across processes; OS closes this lock on crashes.
    let _lock = OpenOptions::new().create(true).truncate(false).read(true).write(true).share_mode(0)
        .open(base.join("native-cli.lock")).map_err(|_| "BUSY")?;
    let (executable, _pinned_file) = pinned_executable(&config)?;
    let env = environment(&config)?;
    let workdir = base.join(format!("draft-{}-{}", std::process::id(), now()?));
    std::fs::create_dir(&workdir).map_err(|_| "WORKDIR_FAILED")?;
    let result = run(&config, &handoff, &executable, &env, &workdir);
    // Never recursively delete unexpected CLI output. A nonempty directory remains for explicit user inspection.
    match std::fs::remove_dir(&workdir) {
        Ok(()) => result,
        Err(_) => Err("WORKDIR_NOT_EMPTY"),
    }
}
fn run(config: &LocalConfig, handoff: &Handoff, executable: &Path, env: &[u16], workdir: &Path) -> Result<DraftResult> {
    let version = cli_process::run(executable, &["--version".into()], env, workdir, vec![], Duration::from_secs(5))
        .map_err(|_| "VERSION_CHECK_FAILED")?;
    if version.stdout.trim() != "2.1.289 (Claude Code)" { return Err("UNSUPPORTED_VERSION"); }
    let client = reqwest::blocking::Client::builder().redirect(reqwest::redirect::Policy::none()).no_proxy()
        .timeout(Duration::from_secs(8)).build().map_err(|_| "HTTP_SETUP_FAILED")?;
    let redeemed: Redeemed = post(&client, &config.origin, "/v1/ai/native/redeem",
        serde_json::json!({"ticket": handoff.ticket, "requestId": handoff.request_id}))?;
    let binding = redeemed.validate(config, handoff, now()?)?;
    let remaining = binding.expires_at.saturating_sub(now()?).saturating_sub(10_000).min(45_000);
    if remaining < 1000 { return Err("HANDOFF_EXPIRED"); }
    let input = serde_json::to_vec(&serde_json::json!({"instruction": redeemed.instruction, "untrustedMailContext": redeemed.context}))
        .map_err(|_| "INPUT_INVALID")?;
    let output = cli_process::run(executable, &claude_args(), env, workdir, input, Duration::from_millis(remaining))
        .map_err(|_| "GENERATION_FAILED")?;
    let draft = parse_draft(&output.stdout)?;
    let checked: Binding = post(&client, &config.origin, "/v1/ai/native/check",
        serde_json::json!({"lease": redeemed.lease, "requestId": handoff.request_id}))?;
    if checked != binding || checked.expires_at <= now()? { return Err("SESSION_CHANGED"); }
    Ok(DraftResult { binding, draft, provider: "claude" })
}
