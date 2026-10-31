namespace Elevateo.Client.Core.Auth;

/// <summary>
/// Durable storage for the refresh credential only.
/// AIDEV-NOTE: the access token stays in memory (AuthSession); only the refresh token is persisted,
/// and sign-out must erase it. Implementations: WindowsCredentialStore (prod), InMemoryTokenStore (tests).
/// </summary>
public interface ITokenStore
{
    /// <summary>Returns the stored refresh credential, or null when none exists.</summary>
    string? ReadRefreshToken();

    void WriteRefreshToken(string refreshToken);

    /// <summary>Erases the stored credential. Idempotent: erasing an absent credential succeeds.</summary>
    [System.Diagnostics.CodeAnalysis.SuppressMessage("Naming", "CA1716", Justification = "Internal C# client API; no Visual Basic overrides.")]
    void Erase();
}

/// <summary>Test double / non-Windows fallback. Never persists across process restarts.</summary>
public sealed class InMemoryTokenStore : ITokenStore
{
    private string? _refreshToken;

    public string? ReadRefreshToken() => _refreshToken;

    public void WriteRefreshToken(string refreshToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(refreshToken);
        _refreshToken = refreshToken;
    }

    public void Erase() => _refreshToken = null;
}

/// <summary>In-memory authenticated session state; cleared on sign-out.</summary>
public sealed class AuthSession
{
    private readonly ITokenStore _store;
    private string? _accessToken;

    public AuthSession(ITokenStore store) => _store = store;

    public bool IsSignedIn => _accessToken is not null;

    public string? AccessToken => _accessToken;

    public void Establish(SignInSuccess success)
    {
        ArgumentNullException.ThrowIfNull(success);
        if (!TokenValidation.IsBearerToken(success.AccessToken)
            || success.RefreshToken is { Length: 0 })
        {
            throw new ArgumentException("Invalid session credentials.", nameof(success));
        }

        // AIDEV-NOTE: persist first; a storage failure leaves the previously published session unchanged.
        if (success.RefreshToken is not null)
        {
            _store.WriteRefreshToken(success.RefreshToken);
        }
        else
        {
            _store.Erase();
        }
        _accessToken = success.AccessToken;
    }

    /// <summary>Sign-out erases both the in-memory access token and the persisted refresh credential.</summary>
    public void SignOut()
    {
        _accessToken = null;
        _store.Erase();
    }
}
