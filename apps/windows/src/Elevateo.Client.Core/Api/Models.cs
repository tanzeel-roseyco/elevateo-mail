using System.Text.Json.Serialization;

namespace Elevateo.Client.Core.Api;

// AIDEV-NOTE: shapes mirror contracts/v1/openapi.json; ApiResponseValidation rejects explicit nulls and bounds.

public sealed record Address(
    [property: JsonPropertyName("display_name")] string? DisplayName,
    [property: JsonPropertyName("address")] string? AddressValue);

public sealed record SessionActor
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("display_name")] public string? DisplayName { get; init; }
}

public sealed record SessionOrganization
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("name")] public required string Name { get; init; }
}

public sealed record Session
{
    [JsonPropertyName("context_id")] public required string ContextId { get; init; }
    [JsonPropertyName("authorization_version")] public required string AuthorizationVersion { get; init; }
    [JsonPropertyName("actor")] public required SessionActor Actor { get; init; }
    [JsonPropertyName("organization")] public required SessionOrganization Organization { get; init; }
    [JsonPropertyName("simulation_mode")] public required bool SimulationMode { get; init; }
    [JsonPropertyName("csrf_token")] public required string CsrfToken { get; init; }
}

public sealed record MailboxCapabilities
{
    [JsonPropertyName("read")] public required bool Read { get; init; }
    [JsonPropertyName("compose")] public required bool Compose { get; init; }
    [JsonPropertyName("approve_send")] public required bool ApproveSend { get; init; }
    [JsonPropertyName("manage_members")] public required bool ManageMembers { get; init; }
}

public sealed record Mailbox
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("display_name")] public required string DisplayName { get; init; }
    [JsonPropertyName("display_address")] public string? DisplayAddress { get; init; }
    [JsonPropertyName("capabilities")] public required MailboxCapabilities Capabilities { get; init; }
}

public sealed record MailboxPage
{
    [JsonPropertyName("context_id")] public required string ContextId { get; init; }
    [JsonPropertyName("authorization_version")] public required string AuthorizationVersion { get; init; }
    [JsonPropertyName("next_cursor")] public string? NextCursor { get; init; }
    [JsonPropertyName("items")] public required IReadOnlyList<Mailbox> Items { get; init; }
}

public sealed record ThreadSummary
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("mailbox_id")] public required string MailboxId { get; init; }
    [JsonPropertyName("subject")] public string? Subject { get; init; }
    [JsonPropertyName("subject_truncated")] public required bool SubjectTruncated { get; init; }
    [JsonPropertyName("sender")] public Address? Sender { get; init; }
    [JsonPropertyName("preview_text")] public required string PreviewText { get; init; }
    [JsonPropertyName("last_message_at")] public string? LastMessageAt { get; init; }
    [JsonPropertyName("unread")] public required bool Unread { get; init; }
    [JsonPropertyName("message_count")] public required int MessageCount { get; init; }
    [JsonPropertyName("folder")] public required string Folder { get; init; }
    [JsonPropertyName("snoozed_until")] public string? SnoozedUntil { get; init; }
    [JsonPropertyName("starred")] public required bool Starred { get; init; }
}

public sealed record ThreadPage
{
    [JsonPropertyName("context_id")] public required string ContextId { get; init; }
    [JsonPropertyName("authorization_version")] public required string AuthorizationVersion { get; init; }
    [JsonPropertyName("next_cursor")] public string? NextCursor { get; init; }
    [JsonPropertyName("mailbox_id")] public required string MailboxId { get; init; }
    [JsonPropertyName("items")] public required IReadOnlyList<ThreadSummary> Items { get; init; }
}

public sealed record ThreadDetail
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("mailbox_id")] public required string MailboxId { get; init; }
    [JsonPropertyName("subject")] public string? Subject { get; init; }
    [JsonPropertyName("subject_truncated")] public required bool SubjectTruncated { get; init; }
    [JsonPropertyName("unread")] public required bool Unread { get; init; }
    [JsonPropertyName("message_count")] public required int MessageCount { get; init; }
    [JsonPropertyName("folder")] public required string Folder { get; init; }
    [JsonPropertyName("snoozed_until")] public string? SnoozedUntil { get; init; }
    [JsonPropertyName("starred")] public required bool Starred { get; init; }
}

public sealed record Message
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("sender")] public Address? Sender { get; init; }
    [JsonPropertyName("to")] public required IReadOnlyList<Address> To { get; init; }
    [JsonPropertyName("sent_at")] public string? SentAt { get; init; }
    // AIDEV-NOTE: body_text is the only body the client ever receives/renders; never treat it as HTML.
    [JsonPropertyName("body_text")] public required string BodyText { get; init; }
    [JsonPropertyName("body_truncated")] public required bool BodyTruncated { get; init; }
    [JsonPropertyName("attachment_count")] public required int AttachmentCount { get; init; }
}

public sealed record ThreadDetailPage
{
    [JsonPropertyName("context_id")] public required string ContextId { get; init; }
    [JsonPropertyName("authorization_version")] public required string AuthorizationVersion { get; init; }
    [JsonPropertyName("next_cursor")] public string? NextCursor { get; init; }
    [JsonPropertyName("thread")] public required ThreadDetail Thread { get; init; }
    [JsonPropertyName("messages")] public required IReadOnlyList<Message> Messages { get; init; }
}

public sealed record DraftSaveInput
{
    [JsonPropertyName("mailbox_id")] public required string MailboxId { get; init; }
    [JsonPropertyName("operation_id")] public required string OperationId { get; init; }
    [JsonPropertyName("expected_version")] public required int ExpectedVersion { get; init; }
    [JsonPropertyName("subject")] public required string Subject { get; init; }
    [JsonPropertyName("to")] public required IReadOnlyList<Address> To { get; init; }
    [JsonPropertyName("body_text")] public required string BodyText { get; init; }
    [JsonPropertyName("reply_to_thread_id")] public string? ReplyToThreadId { get; init; }
}

public sealed record DraftSaveResult
{
    [JsonPropertyName("draft_id")] public required string DraftId { get; init; }
    [JsonPropertyName("operation_id")] public required string OperationId { get; init; }
    [JsonPropertyName("version")] public required int Version { get; init; }
    [JsonPropertyName("state")] public required string State { get; init; }
}

public sealed record ErrorBody
{
    [JsonPropertyName("code")] public required string Code { get; init; }
    [JsonPropertyName("message")] public required string Message { get; init; }
    [JsonPropertyName("request_id")] public required string RequestId { get; init; }
}
