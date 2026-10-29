namespace Elevateo.Client.Core.Configuration;

/// <summary>Validated client configuration. Construct via <see cref="Create"/>; invalid input throws.</summary>
public sealed class ClientConfiguration
{
    public Uri ApiBaseUri { get; }
    public Uri OidcAuthorizeEndpoint { get; }
    public Uri OidcTokenEndpoint { get; }
    public string OidcClientId { get; }
    public TimeSpan RequestTimeout { get; }

    private ClientConfiguration(Uri apiBaseUri, Uri authorize, Uri token, string clientId, TimeSpan timeout)
    {
        ApiBaseUri = apiBaseUri;
        OidcAuthorizeEndpoint = authorize;
        OidcTokenEndpoint = token;
        OidcClientId = clientId;
        RequestTimeout = timeout;
    }

    /// <summary>
    /// AIDEV-NOTE: env var ELEVATEO_API_BASE_URL overrides appsettings; HTTPS is required except 127.0.0.1
    /// so a local simulator can be used without weakening production transport.
    /// </summary>
    public static ClientConfiguration Create(
        string apiBaseUrl,
        string oidcAuthorizeEndpoint,
        string oidcTokenEndpoint,
        string oidcClientId,
        TimeSpan? requestTimeout = null)
    {
        var api = ParseEndpoint(apiBaseUrl, nameof(apiBaseUrl));
        var authorize = ParseEndpoint(oidcAuthorizeEndpoint, nameof(oidcAuthorizeEndpoint));
        var token = ParseEndpoint(oidcTokenEndpoint, nameof(oidcTokenEndpoint));
        if (string.IsNullOrWhiteSpace(oidcClientId) || oidcClientId.Length > 256)
        {
            throw new ArgumentException("OIDC client id must be 1..256 characters.", nameof(oidcClientId));
        }

        var timeout = requestTimeout ?? TimeSpan.FromSeconds(30);
        if (timeout <= TimeSpan.Zero || timeout > TimeSpan.FromMinutes(5))
        {
            throw new ArgumentOutOfRangeException(nameof(requestTimeout), "Timeout must be in (0s, 5m].");
        }

        return new ClientConfiguration(api, authorize, token, oidcClientId.Trim(), timeout);
    }

    private static Uri ParseEndpoint(string value, string name)
    {
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri))
        {
            throw new ArgumentException($"'{name}' is not an absolute URL.", name);
        }

        var isLoopback = uri.IsLoopback;
        if (uri.Scheme != Uri.UriSchemeHttps && !(uri.Scheme == Uri.UriSchemeHttp && isLoopback))
        {
            throw new ArgumentException($"'{name}' must use https (http allowed only for loopback).", name);
        }

        return uri;
    }
}
