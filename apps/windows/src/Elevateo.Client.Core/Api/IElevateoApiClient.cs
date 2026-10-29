namespace Elevateo.Client.Core.Api;

/// <summary>Typed surface the UI consumes; see ElevateoApiClient for the HTTP implementation.</summary>
public interface IElevateoApiClient
{
    Task<ApiResult<Session>> GetSessionAsync(CancellationToken ct);
    Task<ApiResult<MailboxPage>> ListMailboxesAsync(string? cursor, CancellationToken ct);
    Task<ApiResult<ThreadPage>> ListThreadsAsync(string mailboxId, string? cursor, CancellationToken ct);
    Task<ApiResult<ThreadDetailPage>> GetThreadAsync(string threadId, string mailboxId, string? cursor, CancellationToken ct);
    Task<ApiResult<DraftSaveResult>> SaveDraftAsync(string draftId, DraftSaveInput input, CancellationToken ct);
}
