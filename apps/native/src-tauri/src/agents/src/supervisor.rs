use crate::{sandbox::Sandbox, Bridge, Credentials, Error, EventType, Runtime, Start};
use std::{sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{oneshot, Notify},
};
use uuid::Uuid;

// AIDEV-NOTE: The launcher has its own deadline so the container also terminates if the desktop disappears.
pub(crate) async fn execute(
    bridge: Bridge,
    id: Uuid,
    request: Start,
    credentials: Credentials,
    signal: Arc<Notify>,
    ready: oneshot::Sender<Result<(), Error>>,
) {
    let sandbox = Sandbox::new(bridge.config.clone(), id);
    let prepared = sandbox.prepare(request.runtime).await;
    let mut child = match prepared.and_then(|()| sandbox.spawn()) {
        Ok(child) => child,
        Err(error) => {
            let cleaned = sandbox.cleanup().await.is_ok();
            bridge.finish(id, EventType::Failed, cleaned).await;
            let _receiver_gone = ready.send(Err(error));
            return;
        }
    };
    let payload = serde_json::json!({"runtime": match request.runtime { Runtime::Codex => "codex", Runtime::Claude => "claude" },
        "prompt": request.prompt, "timeout_seconds": request.timeout_seconds,
        "mcp_url": bridge.config.mcp_url.as_str(), "grant_token": credentials.grant_token,
        "provider_key": credentials.provider_key});
    let mut output = child.stdout.take();
    let initialized = async {
        let mut input = child.stdin.take().ok_or(Error::TemporarilyUnavailable)?;
        input
            .write_all(payload.to_string().as_bytes())
            .await
            .map_err(|_| Error::TemporarilyUnavailable)?;
        input
            .shutdown()
            .await
            .map_err(|_| Error::TemporarilyUnavailable)?;
        drop(input);
        // AIDEV-NOTE: Do not report running until the fixed launcher has spawned its allowlisted CLI.
        let mut acknowledgement = [0_u8; 6];
        output
            .as_mut()
            .ok_or(Error::TemporarilyUnavailable)?
            .read_exact(&mut acknowledgement)
            .await
            .map_err(|_| Error::TemporarilyUnavailable)?;
        if &acknowledgement == b"READY\n" {
            Ok(())
        } else {
            Err(Error::TemporarilyUnavailable)
        }
    };
    if !matches!(
        tokio::time::timeout(Duration::from_secs(10), initialized).await,
        Ok(Ok(()))
    ) {
        let cleaned = sandbox.cleanup().await.is_ok();
        let _kill_result = child.kill().await;
        bridge.finish(id, EventType::Failed, cleaned).await;
        let _receiver_gone = ready.send(Err(Error::TemporarilyUnavailable));
        return;
    }
    if ready.send(Ok(())).is_err() {
        signal.notify_one();
    }
    let kind = match output {
        None => EventType::Failed,
        Some(mut output) => {
            let read = async {
                let mut buffer = [0_u8; 4096];
                let mut pending = Vec::with_capacity(4100);
                loop {
                    match output.read(&mut buffer).await {
                        Ok(0) if !pending.is_empty() => return EventType::Failed,
                        Ok(0) => {
                            return match child.wait().await {
                                Ok(status) if status.success() => EventType::Completed,
                                Ok(status) if status.code() == Some(124) => EventType::TimedOut,
                                _ => EventType::Failed,
                            }
                        }
                        Ok(count) => {
                            pending.extend_from_slice(&buffer[..count]);
                            let valid = match std::str::from_utf8(&pending) {
                                Ok(_) => pending.len(),
                                Err(error) if error.error_len().is_none() => error.valid_up_to(),
                                Err(_) => return EventType::Failed,
                            };
                            if valid > 0 {
                                let text = String::from_utf8(pending.drain(..valid).collect())
                                    .expect("validated UTF-8");
                                if bridge.output(id, text).await.is_err() {
                                    return EventType::Failed;
                                }
                            }
                        }
                        Err(_) => return EventType::Failed,
                    }
                }
            };
            tokio::select! {
                kind = read => kind,
                () = signal.notified() => EventType::Cancelled,
                () = tokio::time::sleep(Duration::from_secs(u64::from(request.timeout_seconds))) => EventType::TimedOut,
            }
        }
    };
    let cleaned = sandbox.cleanup().await.is_ok();
    let _kill_result = child.kill().await;
    bridge.finish(id, kind, cleaned).await;
}
