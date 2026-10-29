namespace Elevateo.Client.Core.Api;

/// <summary>Stable client-side classification of an API failure.</summary>
public enum ApiErrorKind
{
    /// <summary>401 unauthenticated — session expired or revoked; clear sensitive state and re-sign-in.</summary>
    SessionExpired,
    /// <summary>404 not_available — absent or inaccessible; the server never discloses which.</summary>
    NotAvailable,
    /// <summary>409 context_changed — bootstrap context stale; re-run session bootstrap.</summary>
    ContextChanged,
    /// <summary>409 draft_conflict / operation_mismatch / draft_consumed on draft saves.</summary>
    DraftConflict,
    /// <summary>400 request_invalid or cursor_invalid.</summary>
    RequestInvalid,
    /// <summary>429 rate_limited; <see cref="ApiError.RetryAfter"/> may be set.</summary>
    RateLimited,
    /// <summary>503 temporarily_unavailable or transport-level failure (network loss, timeout).</summary>
    Unavailable,
    /// <summary>Response did not conform to the contract (malformed JSON, missing fields, size breach).</summary>
    InvalidResponse,
    /// <summary>500 internal_error or any unmapped status.</summary>
    Server,
}

/// <summary>Typed API failure. Message is safe to show; it never contains mail content or tokens.</summary>
public sealed record ApiError(ApiErrorKind Kind, string Message, string? RequestId = null, TimeSpan? RetryAfter = null);

/// <summary>Result of an API call: exactly one of Value / Error is set.</summary>
public sealed class ApiResult<T> where T : class
{
    public T? Value { get; }
    public ApiError? Error { get; }
    public bool IsSuccess => Value is not null;

    private ApiResult(T? value, ApiError? error)
    {
        Value = value;
        Error = error;
    }

    public static ApiResult<T> Ok(T value) => new(value, null);
    public static ApiResult<T> Fail(ApiError error) => new(null, error);
}
