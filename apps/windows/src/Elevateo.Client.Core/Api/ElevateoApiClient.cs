using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Elevateo.Client.Core.Configuration;

namespace Elevateo.Client.Core.Api;

/// <summary>
/// HTTP implementation of the v1 API client.
/// AIDEV-NOTE: contract-request — contracts/v1 authenticates via HttpOnly cookies (web). This desktop
/// client sends Authorization: Bearer from the OIDC flow; server must accept bearer sessions for
/// desktop clients (see final report / docs/contract-requests.md). Until then calls return 401.
/// </summary>
public sealed class ElevateoApiClient : IElevateoApiClient
{
    private const long MaxResponseBytes = 1_048_576; // generous upper bound over per-route contract limits

    private readonly HttpClient _http;
    private readonly ClientConfiguration _config;
    private readonly Func<string?> _accessTokenProvider;

    // AIDEV-NOTE: bootstrap context from GET /v1/session; required headers on every data call.
    private string? _contextId;
    private string? _authorizationVersion;
    private string? _csrfToken;

    public ElevateoApiClient(HttpMessageHandler handler, ClientConfiguration config, Func<string?> accessTokenProvider)
    {
        _config = config;
        _accessTokenProvider = accessTokenProvider;
        _http = new HttpClient(handler, disposeHandler: false)
        {
            BaseAddress = config.ApiBaseUri,
            Timeout = config.RequestTimeout,
        };
    }

    public async Task<ApiResult<Session>> GetSessionAsync(CancellationToken ct)
    {
        var result = await SendAsync("v1/session", HttpMethod.Get, null, withContext: false, withCsrf: false,
            ApiJsonContext.Default.Session, ct).ConfigureAwait(false);
        if (result.IsSuccess)
        {
            var s = result.Value!;
            _contextId = s.ContextId;
            _authorizationVersion = s.AuthorizationVersion;
            _csrfToken = s.CsrfToken;
        }

        return result;
    }

    public Task<ApiResult<MailboxPage>> ListMailboxesAsync(string? cursor, CancellationToken ct) =>
        SendAsync(WithCursor("v1/mailboxes", cursor), HttpMethod.Get, null, withContext: true, withCsrf: false,
            ApiJsonContext.Default.MailboxPage, ct);

    public Task<ApiResult<ThreadPage>> ListThreadsAsync(string mailboxId, string? cursor, CancellationToken ct) =>
        SendAsync(WithCursor($"v1/mailboxes/{Uri.EscapeDataString(mailboxId)}/threads", cursor),
            HttpMethod.Get, null, withContext: true, withCsrf: false, ApiJsonContext.Default.ThreadPage, ct);

    public Task<ApiResult<ThreadDetailPage>> GetThreadAsync(string threadId, string mailboxId, string? cursor, CancellationToken ct)
    {
        var path = $"v1/threads/{Uri.EscapeDataString(threadId)}?mailbox_id={Uri.EscapeDataString(mailboxId)}";
        if (cursor is not null)
        {
            path += "&cursor=" + Uri.EscapeDataString(cursor);
        }

        return SendAsync(path, HttpMethod.Get, null, withContext: true, withCsrf: false,
            ApiJsonContext.Default.ThreadDetailPage, ct);
    }

    public Task<ApiResult<DraftSaveResult>> SaveDraftAsync(string draftId, DraftSaveInput input, CancellationToken ct)
    {
        var body = JsonSerializer.Serialize(input, ApiJsonContext.Default.DraftSaveInput);
        return SendAsync($"v1/drafts/{Uri.EscapeDataString(draftId)}", HttpMethod.Put, body,
            withContext: true, withCsrf: true, ApiJsonContext.Default.DraftSaveResult, ct);
    }

    private static string WithCursor(string path, string? cursor) =>
        cursor is null ? path : path + "?cursor=" + Uri.EscapeDataString(cursor);

    private async Task<ApiResult<T>> SendAsync<T>(
        string relativePath,
        HttpMethod method,
        string? jsonBody,
        bool withContext,
        bool withCsrf,
        System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> typeInfo,
        CancellationToken ct) where T : class
    {
        using var request = new HttpRequestMessage(method, relativePath);
        // AIDEV-NOTE: request id enables server-side correlation without logging payloads client-side.
        request.Headers.TryAddWithoutValidation("X-Request-Id", Guid.NewGuid().ToString("N"));

        var token = _accessTokenProvider();
        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        if (withContext)
        {
            if (_contextId is null || _authorizationVersion is null)
            {
                return ApiResult<T>.Fail(new ApiError(ApiErrorKind.ContextChanged,
                    "Session bootstrap missing; call GetSessionAsync first."));
            }

            request.Headers.TryAddWithoutValidation("X-Session-Context", _contextId);
            request.Headers.TryAddWithoutValidation("X-Authorization-Version", _authorizationVersion);
        }

        if (withCsrf)
        {
            if (_csrfToken is null)
            {
                return ApiResult<T>.Fail(new ApiError(ApiErrorKind.ContextChanged,
                    "CSRF token missing; call GetSessionAsync first."));
            }

            request.Headers.TryAddWithoutValidation("X-CSRF-Token", _csrfToken);
            request.Headers.TryAddWithoutValidation("Origin", _config.ApiBaseUri.GetLeftPart(UriPartial.Authority));
        }

        if (jsonBody is not null)
        {
            request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
        }

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw; // caller-initiated cancellation propagates; it is not an API error
        }
        catch (OperationCanceledException)
        {
            return ApiResult<T>.Fail(new ApiError(ApiErrorKind.Unavailable, "The request timed out."));
        }
        catch (HttpRequestException)
        {
            return ApiResult<T>.Fail(new ApiError(ApiErrorKind.Unavailable, "The server could not be reached."));
        }

        using (response)
        {
            string text;
            try
            {
                text = await ReadBoundedAsync(response, ct).ConfigureAwait(false);
            }
            catch (InvalidDataException)
            {
                return ApiResult<T>.Fail(new ApiError(ApiErrorKind.InvalidResponse, "Response exceeded the size limit."));
            }

            if (!response.IsSuccessStatusCode)
            {
                return ApiResult<T>.Fail(MapError(response, text));
            }

            try
            {
                var value = JsonSerializer.Deserialize(text, typeInfo);
                if (value is null)
                {
                    return ApiResult<T>.Fail(new ApiError(ApiErrorKind.InvalidResponse, "Response body was null."));
                }

                return ApiResult<T>.Ok(value);
            }
            catch (JsonException)
            {
                // Missing required fields and malformed JSON both land here by design.
                return ApiResult<T>.Fail(new ApiError(ApiErrorKind.InvalidResponse,
                    "The server response did not match the API contract."));
            }
        }
    }

    private static async Task<string> ReadBoundedAsync(HttpResponseMessage response, CancellationToken ct)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;
        while ((read = await stream.ReadAsync(chunk, ct).ConfigureAwait(false)) > 0)
        {
            buffer.Write(chunk, 0, read);
            if (buffer.Length > MaxResponseBytes)
            {
                throw new InvalidDataException("Response too large.");
            }
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static ApiError MapError(HttpResponseMessage response, string body)
    {
        string? requestId = null;
        string? code = null;
        try
        {
            var parsed = JsonSerializer.Deserialize(body, ApiJsonContext.Default.ErrorBody);
            requestId = parsed?.RequestId;
            code = parsed?.Code;
        }
        catch (JsonException)
        {
            // Fall through to status-based mapping; an unparseable error body is still an error.
        }

        TimeSpan? retryAfter = null;
        if (response.Headers.RetryAfter?.Delta is { } delta && delta > TimeSpan.Zero)
        {
            retryAfter = delta;
        }

        var kind = response.StatusCode switch
        {
            HttpStatusCode.Unauthorized => ApiErrorKind.SessionExpired,
            HttpStatusCode.NotFound => ApiErrorKind.NotAvailable,
            HttpStatusCode.Conflict when code is "draft_conflict" or "operation_mismatch" or "draft_consumed"
                => ApiErrorKind.DraftConflict,
            HttpStatusCode.Conflict => ApiErrorKind.ContextChanged,
            HttpStatusCode.BadRequest => ApiErrorKind.RequestInvalid,
            HttpStatusCode.TooManyRequests => ApiErrorKind.RateLimited,
            HttpStatusCode.ServiceUnavailable => ApiErrorKind.Unavailable,
            _ => ApiErrorKind.Server,
        };

        var message = kind switch
        {
            ApiErrorKind.SessionExpired => "Your session has expired. Sign in again.",
            ApiErrorKind.NotAvailable => "This item is not available.",
            ApiErrorKind.DraftConflict => "The draft changed elsewhere. Reload before saving.",
            ApiErrorKind.ContextChanged => "Your access changed. The app will refresh your session.",
            ApiErrorKind.RateLimited => "Too many requests. Try again shortly.",
            ApiErrorKind.Unavailable => "The service is temporarily unavailable.",
            _ => "The server reported an error.",
        };

        return new ApiError(kind, message, requestId, retryAfter);
    }
}
