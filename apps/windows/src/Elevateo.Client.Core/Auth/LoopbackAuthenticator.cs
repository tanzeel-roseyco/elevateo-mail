using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Web;
using Elevateo.Client.Core.Api;
using Elevateo.Client.Core.Configuration;

namespace Elevateo.Client.Core.Auth;

/// <summary>Validated token endpoint response (OIDC/Authentik).</summary>
public sealed record TokenResponse
{
    [JsonPropertyName("access_token")] public required string AccessToken { get; init; }
    [JsonPropertyName("token_type")] public required string TokenType { get; init; }
    [JsonPropertyName("expires_in")] public required int ExpiresIn { get; init; }
    [JsonPropertyName("refresh_token")] public string? RefreshToken { get; init; }
}

public sealed record SignInSuccess(string AccessToken, DateTimeOffset AccessExpiresAt, string? RefreshToken);

public sealed record SignInFailure(string Reason);

public sealed class SignInResult
{
    public SignInSuccess? Success { get; }
    public SignInFailure? Failure { get; }
    private SignInResult(SignInSuccess? s, SignInFailure? f) { Success = s; Failure = f; }
    public static SignInResult Ok(SignInSuccess s) => new(s, null);
    public static SignInResult Fail(string reason) => new(null, new SignInFailure(reason));
}

/// <summary>
/// RFC 8252 authorization-code + PKCE sign-in via the system browser and a loopback redirect.
/// AIDEV-NOTE: HttpListener binds 127.0.0.1 on an OS-assigned port; redirect_uri uses that exact port.
/// The browser launcher and token-endpoint handler are injected so tests run without a real browser.
/// </summary>
public sealed class LoopbackAuthenticator
{
    private static readonly TimeSpan AttemptLifetime = TimeSpan.FromMinutes(5);

    private readonly ClientConfiguration _config;
    private readonly Func<Uri, Task> _browserLauncher;
    private readonly HttpMessageHandler _tokenHandler;
    private readonly TimeProvider _clock;

    public LoopbackAuthenticator(
        ClientConfiguration config,
        Func<Uri, Task> browserLauncher,
        HttpMessageHandler tokenHandler,
        TimeProvider? clock = null)
    {
        _config = config;
        _browserLauncher = browserLauncher;
        _tokenHandler = tokenHandler;
        _clock = clock ?? TimeProvider.System;
    }

    public async Task<SignInResult> SignInAsync(CancellationToken ct)
    {
        var pkce = PkceMaterial.Create();
        var validator = new AuthCallbackValidator(pkce.State, AttemptLifetime, _clock);

        using var listener = new HttpListener();
        var port = StartOnFreePort(listener);
        var redirectUri = $"http://127.0.0.1:{port}/callback";

        var authorizeUrl = new UriBuilder(_config.OidcAuthorizeEndpoint)
        {
            Query = "response_type=code"
                + "&client_id=" + Uri.EscapeDataString(_config.OidcClientId)
                + "&redirect_uri=" + Uri.EscapeDataString(redirectUri)
                + "&scope=" + Uri.EscapeDataString("openid profile email offline_access")
                + "&state=" + Uri.EscapeDataString(pkce.State)
                + "&code_challenge=" + Uri.EscapeDataString(pkce.Challenge)
                + "&code_challenge_method=S256",
        }.Uri;

        await _browserLauncher(authorizeUrl).ConfigureAwait(false);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(AttemptLifetime);

        string? code = null;
        try
        {
            // Serve callbacks until one is accepted or the attempt is burned/expired.
            while (code is null)
            {
                var context = await listener.GetContextAsync().WaitAsync(timeout.Token).ConfigureAwait(false);
                var query = HttpUtility.ParseQueryString(context.Request.Url?.Query ?? string.Empty);
                var result = validator.Validate(query["state"], query["code"], query["error"]);
                await RespondAsync(context.Response, result.Outcome).ConfigureAwait(false);

                switch (result.Outcome)
                {
                    case CallbackOutcome.Accepted:
                        code = result.Code;
                        break;
                    case CallbackOutcome.StateMismatch:
                        continue; // unrelated/stale redirect: ignore, keep waiting for the real one
                    default:
                        return SignInResult.Fail(FailureMessage(result.Outcome));
                }
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return SignInResult.Fail("Sign-in timed out. Try again.");
        }
        finally
        {
            listener.Stop();
        }

        return await ExchangeCodeAsync(code, redirectUri, pkce.Verifier, ct).ConfigureAwait(false);
    }

    private async Task<SignInResult> ExchangeCodeAsync(string code, string redirectUri, string verifier, CancellationToken ct)
    {
        using var http = new HttpClient(_tokenHandler, disposeHandler: false) { Timeout = _config.RequestTimeout };
        using var request = new HttpRequestMessage(HttpMethod.Post, _config.OidcTokenEndpoint)
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = redirectUri,
                ["client_id"] = _config.OidcClientId,
                ["code_verifier"] = verifier,
            }),
        };

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, ct).ConfigureAwait(false);
        }
        catch (HttpRequestException)
        {
            return SignInResult.Fail("Could not reach the sign-in service.");
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return SignInResult.Fail("The sign-in service timed out.");
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return SignInResult.Fail("The sign-in service rejected the login.");
            }

            TokenResponse? tokens;
            try
            {
                tokens = JsonSerializer.Deserialize(body, ApiJsonContext.Default.TokenResponse);
            }
            catch (JsonException)
            {
                return SignInResult.Fail("The sign-in service returned an invalid response.");
            }

            if (tokens is null
                || !string.Equals(tokens.TokenType, "Bearer", StringComparison.OrdinalIgnoreCase)
                || tokens.ExpiresIn <= 0
                || string.IsNullOrEmpty(tokens.AccessToken))
            {
                return SignInResult.Fail("The sign-in service returned an invalid response.");
            }

            var expiresAt = _clock.GetUtcNow().AddSeconds(tokens.ExpiresIn);
            return SignInResult.Ok(new SignInSuccess(tokens.AccessToken, expiresAt, tokens.RefreshToken));
        }
    }

    private static int StartOnFreePort(HttpListener listener)
    {
        // HttpListener cannot ask the OS for a port, so probe random ephemeral ports.
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var port = Random.Shared.Next(49152, 65535);
            listener.Prefixes.Clear();
            listener.Prefixes.Add($"http://127.0.0.1:{port}/");
            try
            {
                listener.Start();
                return port;
            }
            catch (HttpListenerException)
            {
                // port in use; try another
            }
        }

        throw new InvalidOperationException("No free loopback port found for the sign-in callback.");
    }

    private static string FailureMessage(CallbackOutcome outcome) => outcome switch
    {
        CallbackOutcome.Replayed => "This sign-in link was already used. Start sign-in again.",
        CallbackOutcome.Expired => "The sign-in attempt expired. Start sign-in again.",
        CallbackOutcome.ProviderError => "The identity provider reported an error.",
        _ => "The sign-in response was incomplete. Start sign-in again.",
    };

    private static async Task RespondAsync(HttpListenerResponse response, CallbackOutcome outcome)
    {
        var (status, text) = outcome switch
        {
            CallbackOutcome.Accepted => (200, "Sign-in complete. You can close this tab and return to Elevateo Mail."),
            CallbackOutcome.Replayed => (409, "This sign-in link was already used."),
            _ => (400, "Sign-in failed. Return to Elevateo Mail and try again."),
        };
        response.StatusCode = status;
        response.ContentType = "text/plain; charset=utf-8";
        var bytes = Encoding.UTF8.GetBytes(text);
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes).ConfigureAwait(false);
        response.OutputStream.Close();
    }
}
