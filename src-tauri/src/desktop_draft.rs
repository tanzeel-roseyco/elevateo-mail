use crate::bridge::native_protocol::{self, DraftResult, Handoff};
use std::sync::atomic::{AtomicBool, Ordering};

static RUNNING: AtomicBool = AtomicBool::new(false);
struct RunGuard;
impl RunGuard {
    fn acquire() -> Result<Self, &'static str> {
        RUNNING.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Self).map_err(|_| "DRAFT_BUSY")
    }
}
impl Drop for RunGuard { fn drop(&mut self) { RUNNING.store(false, Ordering::Release); } }
fn parse_handoff(raw: &str) -> Result<Handoff, &'static str> {
    if raw.len() > 1024 { return Err("INVALID_HANDOFF"); }
    let value = serde_json::from_str(raw).map_err(|_| "INVALID_HANDOFF")?;
    native_protocol::validate_handoff(&value, native_protocol::now()?)?;
    Ok(value)
}

// AIDEV-NOTE: The blocking closure owns the guard; losing a renderer promise cannot unlock a running child.
#[tauri::command]
pub async fn prepare_draft(handoff: String) -> Result<DraftResult, &'static str> {
    let value = parse_handoff(&handoff)?;
    let guard = RunGuard::acquire()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        #[cfg(windows)]
        {
            let base = std::env::var_os("LOCALAPPDATA").ok_or("LOCAL_CONFIG_UNAVAILABLE")?;
            crate::bridge::native_runtime::execute(&std::path::PathBuf::from(base).join("ElevateoMail"), value)
        }
        #[cfg(not(windows))]
        { let _ = value; Err("WINDOWS_REQUIRED") }
    }).await.map_err(|_| "DRAFT_FAILED")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unbounded_malformed_and_expired_input() {
        for raw in ["x".repeat(1025), "{}".into(), format!(r#"{{"ticket":"{}","requestId":"r","expiresAt":1}}"#, "a".repeat(64))] {
            assert!(parse_handoff(&raw).is_err());
        }
        let raw = format!(r#"{{"ticket":"{}","requestId":"r","expiresAt":{}}}"#, "a".repeat(64), native_protocol::now().unwrap()+30_000);
        assert!(parse_handoff(&raw).is_ok());
    }
    #[test]
    fn guard_rejects_overlap_and_releases_on_drop() {
        let guard = RunGuard::acquire().unwrap();
        assert!(RunGuard::acquire().is_err());
        drop(guard);
        assert!(RunGuard::acquire().is_ok());
    }
}
