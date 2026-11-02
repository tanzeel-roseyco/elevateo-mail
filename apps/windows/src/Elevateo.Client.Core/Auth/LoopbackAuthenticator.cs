using System.Net;
using System.Net.Sockets;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Web;
using Elevateo.Client.Core.Api;
using Elevateo.Client.Core.Configuration;

namespace Elevateo.Client.Core.Auth;

/// <summary>Validated native-session response (proposed POST /v1/native/sessions).</summary>
public sealed record TokenResponse
{
    [JsonPropertyName("access_token")] public required string AccessToken { get; init; }
    [JsonPropertyName("token_type")] public required string TokenType { get; init; }
    [JsonPropertyName("expires_in")] public required int ExpiresIn { get; init; }
    [JsonPropertyName("refresh_token")] public string? RefreshToken { get; init; }
}

/// <summary>Body of the proposed POST /v1/native/sessions code exchange.</summary>
public sealed record NativeSessionRequest(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("code_verifier")] string CodeVerifier,
    [property: JsonPropertyName("redirect_uri")] string RedirectUri,
    [property: JsonPropertyName("client_id")] string ClientId);

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
/// AIDEV-NOTE: a TCP loopback socket uses an OS-assigned port without administrator HTTP.sys reservations.
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

        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
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
                using var client = await listener.AcceptTcpClientAsync(timeout.Token).ConfigureAwait(false);
                using var callbackTimeout = CancellationTokenSource.CreateLinkedTokenSource(timeout.Token);
                callbackTimeout.CancelAfter(TimeSpan.FromSeconds(5));
                var stream = client.GetStream();
                string? target;
                try
                {
                    target = await ReadCallbackTargetAsync(stream, callbackTimeout.Token).ConfigureAwait(false);
                }
                catch (IOException) { continue; } // disconnected unrelated browser request
                catch (OperationCanceledException) when (!timeout.IsCancellationRequested) { continue; }
                if (target is null) continue;
                var query = HttpUtility.ParseQueryString(target[(target.IndexOf('?') + 1)..]);
                var result = validator.Validate(query["state"], query["code"], query["error"]);
                // AIDEV-NOTE: browser acknowledgement is best effort; accepted state still reaches the exchange.
                await RespondAsync(stream, result.Outcome, callbackTimeout.Token).ConfigureAwait(false);

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
        // AIDEV-NOTE: token responses are small; cap success and error buffering before any string allocation.
        using var http = new HttpClient(_tokenHandler, disposeHandler: false)
        { Timeout = _config.RequestTimeout, MaxResponseContentBufferSize = 65_536 };
        // AIDEV-NOTE: the server, not this client, redeems the code with the IdP and binds it to the
        // verifier/redirect/client (contract-requests section 2, shared with the Mac and iOS clients).
        using var request = new HttpRequestMessage(HttpMethod.Post, _config.NativeSessionsEndpoint)
        {
            Content = JsonContent.Create(
                new NativeSessionRequest(code, verifier, redirectUri, _config.OidcClientId),
                ApiJsonContext.Default.NativeSessionRequest),
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
                || !TokenValidation.IsBearerToken(tokens.AccessToken)
                || tokens.RefreshToken is { Length: 0 })
            {
                return SignInResult.Fail("The sign-in service returned an invalid response.");
            }

            var expiresAt = _clock.GetUtcNow().AddSeconds(tokens.ExpiresIn);
            return SignInResult.Ok(new SignInSuccess(tokens.AccessToken, expiresAt, tokens.RefreshToken));
        }
    }

    internal static async Task<string?> ReadCallbackTargetAsync(Stream stream, CancellationToken ct)
    {
        // AIDEV-NOTE: bound both header bytes and read time; a local slow client cannot hold the attempt forever.
        var bytes = new byte[16_384];
        var length = 0;
        while (length < bytes.Length)
        {
            var read = await stream.ReadAsync(bytes.AsMemory(length, 1), ct).ConfigureAwait(false);
            if (read == 0) return null;
            length += read;
            if (length < 4 || bytes[length - 4] != 13 || bytes[length - 3] != 10
                || bytes[length - 2] != 13 || bytes[length - 1] != 10) continue;
            var line = Encoding.ASCII.GetString(bytes, 0, length).Split("\r\n", 2)[0].Split(' ');
            return line.Length == 3 && line[0] == "GET" && line[1].StartsWith("/callback?", StringComparison.Ordinal)
                && line[2] == "HTTP/1.1" ? line[1] : null;
        }
        return null;
    }

    private static string FailureMessage(CallbackOutcome outcome) => outcome switch
    {
        CallbackOutcome.Replayed => "This sign-in link was already used. Start sign-in again.",
        CallbackOutcome.Expired => "The sign-in attempt expired. Start sign-in again.",
        CallbackOutcome.ProviderError => "The identity provider reported an error.",
        _ => "The sign-in response was incomplete. Start sign-in again.",
    };

    internal static async Task RespondAsync(Stream stream, CallbackOutcome outcome, CancellationToken ct)
    {
        var (status, text) = outcome switch
        {
            CallbackOutcome.Accepted => ("200 OK", "Sign-in complete. You can close this tab and return to Elevateo Mail."),
            CallbackOutcome.Replayed => ("409 Conflict", "This sign-in link was already used."),
            _ => ("400 Bad Request", "Sign-in failed. Return to Elevateo Mail and try again."),
        };
        var body = Encoding.UTF8.GetBytes(text);
        var header = Encoding.ASCII.GetBytes($"HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n");
        try
        {
            await stream.WriteAsync(header, ct).ConfigureAwait(false);
            await stream.WriteAsync(body, ct).ConfigureAwait(false);
        }
        catch (IOException) { /* A disconnected browser cannot revoke an already accepted callback. */ }
        catch (OperationCanceledException) { /* Acknowledgement deadline does not invalidate the accepted code. */ }
    }
}
