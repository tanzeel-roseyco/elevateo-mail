#[path = "../src/bridge/native_protocol.rs"]
mod protocol;
use protocol::*;

fn config() -> LocalConfig {
    LocalConfig { trust_installed_cli_and_admin_policy: true, origin: "https://mail.example.com".into(),
        account_id: "account-1".into(), executable: "C:\\Claude\\claude.exe".into(), sha256: "a".repeat(64),
        claude_config_dir: "C:\\Profile\\Claude".into() }
}
fn handoff() -> Handoff { Handoff { ticket: "b".repeat(64), request_id: "request-1".into(), expires_at: 60_000 } }
fn redeemed() -> Redeemed {
    Redeemed { account_id: "account-1".into(), session_generation: "c".repeat(64), request_id: "request-1".into(),
        mailbox_id: "box-1".into(), expires_at: 60_000, instruction: "Draft a reply".into(), context: "untrusted".into(), lease: "d".repeat(64) }
}
#[test]
fn binds_exact_account_request_and_expiry() {
    let mut value = redeemed(); assert!(value.validate(&config(), &handoff(), 1).is_ok());
    value.account_id = "another".into(); assert!(value.validate(&config(), &handoff(), 1).is_err());
    value = redeemed(); value.request_id = "other".into(); assert!(value.validate(&config(), &handoff(), 1).is_err());
    value = redeemed(); assert!(value.validate(&config(), &handoff(), 60_000).is_err());
    value.expires_at += 1; assert!(value.validate(&config(), &handoff(), 1).is_err());
}
#[test]
fn local_trust_is_explicit_and_origin_cannot_redirect_authority() {
    let mut value = config(); assert!(validate_config(&value).is_ok());
    value.trust_installed_cli_and_admin_policy = false; assert!(validate_config(&value).is_err());
    for url in ["http://mail.example.com", "https://u:p@mail.example.com", "https://mail.example.com/path",
        "https://mail.example.com?x=1", "https://mail.example.com#x", "https://mail.example.com:444"] {
        value = config(); value.origin = url.into(); assert!(validate_config(&value).is_err(), "{url}");
    }
}
#[test]
fn rejects_unknown_handoff_fields_expiry_and_oversized_context() {
    assert!(serde_json::from_str::<Handoff>(r#"{"ticket":"x","requestId":"x","expiresAt":4,"command":"bad"}"#).is_err());
    assert!(validate_handoff(&handoff(), 1).is_ok()); assert!(validate_handoff(&handoff(), 60_000).is_err());
    let mut value = handoff(); value.expires_at = 120_000; assert!(validate_handoff(&value, 1).is_err());
    let mut value = redeemed(); value.context = "a".repeat(90_001); assert!(value.validate(&config(), &handoff(), 1).is_err());
}
#[test]
fn result_allows_metadata_but_never_tool_requests_or_bad_drafts() {
    let mut value = serde_json::json!({"type":"result","subtype":"success","is_error":false,
        "usage":{"input_tokens":20},"structured_output":{"subject":"Hello","body":"Draft"}});
    assert_eq!(parse_draft(&value.to_string()).unwrap().subject, "Hello");
    value["structured_output"]["send"] = true.into(); assert!(parse_draft(&value.to_string()).is_err());
    value["structured_output"] = serde_json::json!({"subject":"bad\nheader","body":"Draft"}); assert!(parse_draft(&value.to_string()).is_err());
    value["type"] = "tool_use".into(); assert!(parse_draft(&value.to_string()).is_err());
    assert!(parse_draft(&"a".repeat(64_001)).is_err());
}
#[test]
fn flags_are_fixed_and_no_context_can_become_an_argument() {
    let args = claude_args();
    assert!(args.windows(2).any(|v| v == ["--tools", ""]));
    assert!(args.windows(2).any(|v| v == ["--disallowedTools", "*"]));
    assert!(args.windows(2).any(|v| v == ["--setting-sources", ""]));
    assert!(args.contains(&"--strict-mcp-config".into()));
}
