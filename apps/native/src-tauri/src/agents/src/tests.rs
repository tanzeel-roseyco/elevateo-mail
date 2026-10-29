#![cfg(unix)]
use super::*;
use std::{fs, os::unix::fs::PermissionsExt, path::PathBuf, time::Duration};

// AIDEV-NOTE: Fake Docker runs only inside the final test container; it never invokes Docker or a provider.
struct Fixture { directory: PathBuf, bridge: Bridge }
struct Resolver(bool);
impl GrantResolver for Resolver {
    fn resolve(&self, _owner: Uuid, _grant: Uuid, _runtime: Runtime) -> Pin<Box<dyn Future<Output = Result<Credentials, Error>> + Send + '_>> {
        Box::pin(async move {
            if self.0 { Ok(Credentials { grant_token: "test-grant".into(), provider_key: "test-key".into() }) }
            else { Err(Error::NotAvailable) }
        })
    }
}
impl Fixture {
    fn new(mode: &str, granted: bool) -> Self {
        let directory = std::env::temp_dir().join(format!("elevateo-agent-test-{}", Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let docker = directory.join("docker");
        let script = r#"#!/bin/sh
shift 2
if [ "$1" = start ]; then
  /bin/cat >/dev/null
  if [ 'MODE' = missing ]; then exit 1; fi
  printf 'READY\n'
  if [ 'MODE' = success ]; then printf 'draft saved [message:123]\n'; exit 0; fi
  if [ 'MODE' = overflow ]; then /usr/bin/head -c 1048577 /dev/zero; exit 0; fi
  exec /bin/sleep 30
fi
exit 0
"#.replace("MODE", mode);
        fs::write(&docker, script).unwrap();
        fs::set_permissions(&docker, fs::Permissions::from_mode(0o700)).unwrap();
        let config = Config { docker, image: format!("sha256:{}", "a".repeat(64)),
            mcp_url: url::Url::parse("https://mail.example.test/mcp").unwrap() };
        let bridge = Bridge::new(config, Arc::new(Resolver(granted))).unwrap();
        Self { directory, bridge }
    }
    async fn terminal(&self, owner: Uuid, id: Uuid) -> Vec<Event> {
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let events = self.bridge.events(owner, id, None).await.unwrap();
                if events.last().is_some_and(|event| event.kind != EventType::Output) { return events; }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }).await.unwrap()
    }
}
impl Drop for Fixture { fn drop(&mut self) { fs::remove_dir_all(&self.directory).unwrap(); } }
fn request(timeout: u16) -> Start {
    Start { runtime: Runtime::Codex, grant_id: Uuid::new_v4(), prompt: "Draft only".into(), timeout_seconds: timeout }
}

#[tokio::test]
async fn happy_path_streams_and_completes_with_monotonic_sequence() {
    let fixture = Fixture::new("success", true);
    let owner = Uuid::new_v4();
    let started = fixture.bridge.start(owner, request(5)).await.unwrap();
    let events = fixture.terminal(owner, started.run_id).await;
    assert_eq!(events.last().unwrap().kind, EventType::Completed);
    assert!(events.iter().any(|event| event.text.contains("[message:123]")));
    assert!(events.iter().enumerate().all(|(index, event)| event.sequence == index as u64));
    assert!(fixture.bridge.events(owner, started.run_id, Some(events.last().unwrap().sequence)).await.unwrap().is_empty());
}
#[tokio::test]
async fn denied_grant_and_missing_runtime_fail_closed() {
    let denied = Fixture::new("success", false);
    assert!(matches!(denied.bridge.start(Uuid::new_v4(), request(5)).await, Err(Error::NotAvailable)));
    let missing = Fixture::new("missing", true);
    assert!(matches!(missing.bridge.start(Uuid::new_v4(), request(5)).await, Err(Error::TemporarilyUnavailable)));
}
#[tokio::test]
async fn cancellation_is_owned_idempotent_and_capacity_bounded() {
    let fixture = Fixture::new("wait", true);
    let owner = Uuid::new_v4();
    let first = fixture.bridge.start(owner, request(30)).await.unwrap();
    let second = fixture.bridge.start(owner, request(30)).await.unwrap();
    assert!(matches!(fixture.bridge.start(owner, request(30)).await, Err(Error::TemporarilyUnavailable)));
    assert!(matches!(fixture.bridge.cancel(Uuid::new_v4(), first.run_id).await, Err(Error::NotAvailable)));
    assert!(matches!(fixture.bridge.events(Uuid::new_v4(), first.run_id, None).await, Err(Error::NotAvailable)));
    assert_eq!(fixture.bridge.cancel(owner, first.run_id).await.unwrap().status, "cancelled");
    assert_eq!(fixture.bridge.cancel(owner, first.run_id).await.unwrap().status, "cancelled");
    fixture.bridge.cancel(owner, second.run_id).await.unwrap();
}
#[tokio::test]
async fn timeout_and_output_flood_terminate_without_unbounded_events() {
    for (mode, expected) in [("wait", EventType::TimedOut), ("overflow", EventType::Failed)] {
        let fixture = Fixture::new(mode, true);
        let owner = Uuid::new_v4();
        let run = fixture.bridge.start(owner, request(1)).await.unwrap();
        let events = fixture.terminal(owner, run.run_id).await;
        assert_eq!(events.last().unwrap().kind, expected);
        assert!(events.len() <= 257);
        assert!(events.iter().map(|event| event.text.len()).sum::<usize>() <= 1_048_576);
    }
}
#[test]
fn refuses_mutable_images_and_unsafe_mcp_origins() {
    let fixture = Fixture::new("success", true);
    let mut config = fixture.bridge.config.clone();
    config.image = "agent:latest".into();
    assert_eq!(config.validate(), Err(Error::InvalidInput));
    config.image = fixture.bridge.config.image.clone();
    for address in ["http://mail.test/mcp", "https://secret@mail.test/mcp", "https://mail.test:8443/mcp"] {
        config.mcp_url = url::Url::parse(address).unwrap();
        assert_eq!(config.validate(), Err(Error::InvalidInput));
    }
}
