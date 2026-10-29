use elevateo_agent_bridge::{
    Bridge, Config, Credentials, Error, EventType, GrantResolver, Runtime, Start,
};
use std::{future::Future, pin::Pin, sync::Arc, time::Duration};
use uuid::Uuid;

// AIDEV-NOTE: Opt-in only inside the final local Docker gate with Dockerfile.fixture's immutable image ID.
struct FixtureResolver;
impl GrantResolver for FixtureResolver {
    fn resolve(
        &self,
        _owner: Uuid,
        _grant: Uuid,
        _runtime: Runtime,
    ) -> Pin<Box<dyn Future<Output = Result<Credentials, Error>> + Send + '_>> {
        Box::pin(async {
            Ok(Credentials {
                grant_token: "fixture-grant".into(),
                provider_key: "fixture-key".into(),
            })
        })
    }
}
fn request(prompt: &str, timeout: u16) -> Start {
    Start {
        runtime: Runtime::Codex,
        grant_id: Uuid::new_v4(),
        prompt: prompt.into(),
        timeout_seconds: timeout,
    }
}
async fn terminal(bridge: &Bridge, owner: Uuid, id: Uuid) -> EventType {
    tokio::time::timeout(Duration::from_secs(90), async {
        loop {
            let events = bridge.events(owner, id, None).await.unwrap();
            if let Some(event) = events
                .last()
                .filter(|event| event.kind != EventType::Output)
            {
                return event.kind;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap()
}
#[tokio::test]
#[ignore = "requires the final gate's task-owned local Docker daemon and fake-runtime image"]
async fn real_container_completion_cancel_and_deadline() {
    let config = Config {
        docker: std::env::var("NATIVE_TEST_DOCKER")
            .expect("absolute Docker path")
            .into(),
        image: std::env::var("NATIVE_TEST_IMAGE").expect("immutable fixture image ID"),
        mcp_url: url::Url::parse("https://mail.example.test/mcp").unwrap(),
    };
    let bridge = Bridge::new(config, Arc::new(FixtureResolver)).unwrap();
    let owner = Uuid::new_v4();
    let completed = bridge.start(owner, request("complete", 30)).await.unwrap();
    assert_eq!(
        terminal(&bridge, owner, completed.run_id).await,
        EventType::Completed
    );
    let cancelled = bridge.start(owner, request("wait", 30)).await.unwrap();
    assert_eq!(
        bridge.cancel(owner, cancelled.run_id).await.unwrap().status,
        "cancelled"
    );
    let timeout = bridge.start(owner, request("wait", 1)).await.unwrap();
    assert_eq!(
        terminal(&bridge, owner, timeout.run_id).await,
        EventType::TimedOut
    );
}
