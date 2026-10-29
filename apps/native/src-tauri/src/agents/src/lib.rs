mod protocol;
mod sandbox;
mod supervisor;
pub use protocol::{Cancelled, Error, Event, EventType, Runtime, Start, Started};
pub use sandbox::Config;
use std::{
    collections::{HashMap, VecDeque},
    future::Future,
    pin::Pin,
    sync::Arc,
};
use tokio::sync::{Mutex, Notify};
use uuid::Uuid;

// AIDEV-NOTE: Implement in trusted native session code, never in a WebView command accepting a bearer token.
// Resolve must authenticate owner+grant with the backend; MCP rechecks revocation on EVERY mailbox request.
pub trait GrantResolver: Send + Sync {
    fn resolve(
        &self,
        owner: Uuid,
        grant: Uuid,
        runtime: Runtime,
    ) -> Pin<Box<dyn Future<Output = Result<Credentials, Error>> + Send + '_>>;
}
pub struct Credentials {
    pub grant_token: String,
    pub provider_key: String,
}
impl Credentials {
    fn validate(&self) -> Result<(), Error> {
        if [&self.grant_token, &self.provider_key].iter().any(|value| {
            value.is_empty() || value.len() > 4096 || value.chars().any(char::is_control)
        }) {
            return Err(Error::NotAvailable);
        }
        Ok(())
    }
}
struct Run {
    owner: Uuid,
    events: Vec<Event>,
    bytes: usize,
    active: bool,
    cancelling: bool,
    terminal: Option<EventType>,
    signal: Arc<Notify>,
    changed: Arc<Notify>,
}
#[derive(Default)]
struct State {
    runs: HashMap<Uuid, Run>,
    finished: VecDeque<Uuid>,
}

// AIDEV-NOTE: One Bridge per native application; capacity stays reserved if process-tree cleanup cannot be proved.
#[derive(Clone)]
pub struct Bridge {
    config: Config,
    resolver: Arc<dyn GrantResolver>,
    state: Arc<Mutex<State>>,
}
impl Bridge {
    pub fn new(config: Config, resolver: Arc<dyn GrantResolver>) -> Result<Self, Error> {
        config.validate()?;
        Ok(Self {
            config,
            resolver,
            state: Arc::new(Mutex::new(State::default())),
        })
    }
    pub async fn start(&self, owner: Uuid, request: Start) -> Result<Started, Error> {
        request.validate()?;
        let credentials = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            self.resolver
                .resolve(owner, request.grant_id, request.runtime),
        )
        .await
        .map_err(|_| Error::TemporarilyUnavailable)??;
        credentials.validate()?;
        let id = Uuid::new_v4();
        let signal = Arc::new(Notify::new());
        {
            let mut state = self.state.lock().await;
            if state.runs.values().filter(|run| run.active).count() >= 2 {
                return Err(Error::TemporarilyUnavailable);
            }
            state.runs.insert(
                id,
                Run {
                    owner,
                    events: Vec::new(),
                    bytes: 0,
                    active: true,
                    cancelling: false,
                    terminal: None,
                    signal: signal.clone(),
                    changed: Arc::new(Notify::new()),
                },
            );
        }
        let (ready, launched) = tokio::sync::oneshot::channel();
        let bridge = self.clone();
        tokio::spawn(async move {
            supervisor::execute(bridge, id, request, credentials, signal, ready).await;
        });
        launched
            .await
            .map_err(|_| Error::TemporarilyUnavailable)??;
        Ok(Started {
            run_id: id,
            status: "running",
        })
    }
    pub async fn events(
        &self,
        owner: Uuid,
        id: Uuid,
        after: Option<u64>,
    ) -> Result<Vec<Event>, Error> {
        let state = self.state.lock().await;
        let run = state
            .runs
            .get(&id)
            .filter(|run| run.owner == owner)
            .ok_or(Error::NotAvailable)?;
        Ok(run
            .events
            .iter()
            .filter(|event| after.is_none_or(|last| event.sequence > last))
            .cloned()
            .collect())
    }
    pub async fn cancel(&self, owner: Uuid, id: Uuid) -> Result<Cancelled, Error> {
        loop {
            let changed = {
                let mut state = self.state.lock().await;
                let run = state
                    .runs
                    .get_mut(&id)
                    .filter(|run| run.owner == owner)
                    .ok_or(Error::NotAvailable)?;
                if let Some(terminal) = run.terminal {
                    return if terminal == EventType::Cancelled && !run.active {
                        Ok(Cancelled {
                            run_id: id,
                            status: "cancelled",
                        })
                    } else {
                        Err(Error::NotAvailable)
                    };
                }
                run.cancelling = true;
                run.signal.notify_one();
                run.changed.clone()
            };
            // Register before rechecking state to avoid a completion between unlock and notification wait.
            let notified = changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self
                .state
                .lock()
                .await
                .runs
                .get(&id)
                .is_some_and(|run| run.terminal.is_some())
            {
                continue;
            }
            if tokio::time::timeout(std::time::Duration::from_secs(90), notified)
                .await
                .is_err()
            {
                return Err(Error::TemporarilyUnavailable);
            }
        }
    }
    async fn output(&self, id: Uuid, text: String) -> Result<(), Error> {
        let mut state = self.state.lock().await;
        let run = state.runs.get_mut(&id).ok_or(Error::NotAvailable)?;
        // Limit both aggregate bytes and event count: a one-byte producer cannot exhaust memory with metadata.
        if run.bytes + text.len() > 1_048_576 || run.events.len() >= 256 {
            return Err(Error::TemporarilyUnavailable);
        }
        run.bytes += text.len();
        run.events.push(Event {
            run_id: id,
            sequence: run.events.len() as u64,
            kind: EventType::Output,
            text,
        });
        Ok(())
    }
    async fn finish(&self, id: Uuid, kind: EventType, cleaned: bool) {
        let mut state = self.state.lock().await;
        if let Some(run) = state.runs.get_mut(&id) {
            let kind = if cleaned && run.cancelling {
                EventType::Cancelled
            } else if cleaned {
                kind
            } else {
                EventType::Failed
            };
            run.active = !cleaned;
            run.terminal = Some(kind);
            run.events.push(Event {
                run_id: id,
                sequence: run.events.len() as u64,
                kind,
                text: String::new(),
            });
            run.changed.notify_waiters();
            if cleaned {
                state.finished.push_back(id);
            }
        }
        while state.finished.len() > 32 {
            if let Some(oldest) = state.finished.pop_front() {
                state.runs.remove(&oldest);
            }
        }
    }
}

#[cfg(test)]
mod tests;
