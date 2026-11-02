using System.Security.Cryptography;
using System.Text;

namespace Elevateo.Client.Core.Auth;

public enum CallbackOutcome
{
    Accepted,
    StateMismatch,
    Replayed,
    Expired,
    MissingCode,
    ProviderError,
}

public sealed record CallbackResult(CallbackOutcome Outcome, string? Code);

/// <summary>
/// Validates exactly one authorization callback per login attempt.
/// AIDEV-NOTE: state is single-use — a second valid-state callback is a replay and is rejected;
/// a stale callback after expiry burns the attempt rather than adopting its code (see auth proposal doc).
/// </summary>
public sealed class AuthCallbackValidator
{
    private readonly string _expectedState;
    private readonly DateTimeOffset _expiresAt;
    private readonly TimeProvider _clock;
    private bool _consumed;
    private readonly object _gate = new();

    public AuthCallbackValidator(string expectedState, TimeSpan lifetime, TimeProvider? clock = null)
    {
        if (string.IsNullOrEmpty(expectedState))
        {
            throw new ArgumentException("State must be non-empty.", nameof(expectedState));
        }

        _expectedState = expectedState;
        _clock = clock ?? TimeProvider.System;
        _expiresAt = _clock.GetUtcNow() + lifetime;
    }

    public CallbackResult Validate(string? state, string? code, string? error)
    {
        lock (_gate)
        {
            if (_clock.GetUtcNow() > _expiresAt)
            {
                _consumed = true; // expiry remains terminal even if the wall clock later moves backward
                return new CallbackResult(CallbackOutcome.Expired, null);
            }

            if (state is null || !FixedTimeEquals(state, _expectedState))
            {
                return new CallbackResult(CallbackOutcome.StateMismatch, null);
            }

            if (_consumed)
            {
                return new CallbackResult(CallbackOutcome.Replayed, null);
            }

            _consumed = true; // burn the state before inspecting code so a racing replay cannot win

            if (!string.IsNullOrEmpty(error))
            {
                return new CallbackResult(CallbackOutcome.ProviderError, null);
            }

            if (string.IsNullOrEmpty(code))
            {
                return new CallbackResult(CallbackOutcome.MissingCode, null);
            }

            return new CallbackResult(CallbackOutcome.Accepted, code);
        }
    }

    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}
