use serde::{Deserialize, Serialize};
use uuid::Uuid;

// AIDEV-NOTE: Wire names mirror contracts/v2/completion.openapi.json's native-only protocol.
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Runtime {
    Codex,
    Claude,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Start {
    pub runtime: Runtime,
    pub grant_id: Uuid,
    pub prompt: String,
    pub timeout_seconds: u16,
}

impl Start {
    pub fn validate(&self) -> Result<(), Error> {
        if self.prompt.is_empty()
            || self.prompt.chars().count() > 16_384
            || !(1..=300).contains(&self.timeout_seconds)
        {
            return Err(Error::InvalidInput);
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    Output,
    Completed,
    Failed,
    Cancelled,
    TimedOut,
}

#[derive(Clone, Serialize)]
pub struct Event {
    pub run_id: Uuid,
    pub sequence: u64,
    #[serde(rename = "type")]
    pub kind: EventType,
    pub text: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    InvalidInput,
    NotAvailable,
    TemporarilyUnavailable,
}
impl Error {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidInput => "request_invalid",
            Self::NotAvailable => "not_available",
            Self::TemporarilyUnavailable => "temporarily_unavailable",
        }
    }
}

#[derive(Serialize)]
pub struct Started {
    pub run_id: Uuid,
    pub status: &'static str,
}
#[derive(Serialize)]
pub struct Cancelled {
    pub run_id: Uuid,
    pub status: &'static str,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn request_accepts_unicode_at_contract_limit() {
        let request = Start {
            runtime: Runtime::Codex,
            grant_id: Uuid::new_v4(),
            prompt: "界".repeat(16_384),
            timeout_seconds: 300,
        };
        assert!(request.validate().is_ok());
    }
    #[test]
    fn rejects_empty_oversized_and_invalid_timeout() {
        for (prompt, timeout) in [
            (String::new(), 1),
            ("a".repeat(16_385), 1),
            ("ok".into(), 0),
            ("ok".into(), 301),
        ] {
            assert_eq!(
                Start {
                    runtime: Runtime::Claude,
                    grant_id: Uuid::new_v4(),
                    prompt,
                    timeout_seconds: timeout
                }
                .validate(),
                Err(Error::InvalidInput)
            );
        }
    }
    #[test]
    fn rejects_unknown_fields_and_null() {
        assert!(serde_json::from_str::<Start>("null").is_err());
        let body = format!(
            r#"{{"runtime":"claude","grant_id":"{}","prompt":"ok","timeout_seconds":1,"shell":"sh"}}"#,
            Uuid::new_v4()
        );
        assert!(serde_json::from_str::<Start>(&body).is_err());
    }
}
