using System.Net;
using System.Text.Json;
using System.Web;
using Elevateo.Client.Core.Auth;
using Elevateo.Client.Core.Configuration;
using Xunit;

namespace Elevateo.Client.Core.Tests;

public class AuthFlowTests
{
    private const string TokenJson =
        """{"access_token":"at-123","token_type":"Bearer","expires_in":600,"refresh_token":"rt-456"}""";

    private static (LoopbackAuthenticator Auth, Task<Uri> AuthorizeUrl, StubHandler Tokens) CreateAuthenticator()
    {
        var urlSource = new TaskCompletionSource<Uri>(TaskCreationOptions.RunContinuationsAsynchronously);
        var tokens = new StubHandler(_ => StubHandler.Json(HttpStatusCode.OK, TokenJson));
        var auth = new LoopbackAuthenticator(
            TestConfig.Create(),
            url => { urlSource.SetResult(url); return Task.CompletedTask; },
            tokens);
        return (auth, urlSource.Task, tokens);
    }

    private static (string RedirectUri, string State) ParseAuthorizeUrl(Uri url)
    {
        var query = HttpUtility.ParseQueryString(url.Query);
        return (query["redirect_uri"]!, query["state"]!);
    }

    /// <summary>
    /// apps/shared/auth-conformance-vectors.json, shared with the Mac (Rust) and iOS (Swift) suites.
    /// ELEVATEO_AUTH_VECTORS points at it when only apps/windows is mounted (Docker runs).
    /// </summary>
    private static JsonElement SharedVectors()
    {
        var path = Environment.GetEnvironmentVariable("ELEVATEO_AUTH_VECTORS");
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); path is null && dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "shared", "auth-conformance-vectors.json");
            if (File.Exists(candidate)) path = candidate;
        }

        Assert.True(path is not null, "apps/shared/auth-conformance-vectors.json not found; set ELEVATEO_AUTH_VECTORS");
        return JsonDocument.Parse(File.ReadAllText(path!)).RootElement;
    }

    [Fact]
    public void Client_ConformsToSharedAuthVectors()
    {
        var vectors = SharedVectors();
        foreach (var vector in vectors.GetProperty("pkce_s256").EnumerateArray())
        {
            Assert.Equal(vector.GetProperty("challenge").GetString(), PkceMaterial.ChallengeFor(vector.GetProperty("verifier").GetString()!));
        }

        foreach (var vector in vectors.GetProperty("identity_provider_endpoints").EnumerateArray())
        {
            var url = vector.GetProperty("url").GetString()!;
            var accepted = Record.Exception(() => ClientConfiguration.Create("https://mail.test.example", url, "client")) is null;
            Assert.True(accepted == vector.GetProperty("accepted").GetBoolean(), url);
        }

        Assert.Equal(
            vectors.GetProperty("native_session_exchange").GetProperty("path").GetString(),
            TestConfig.Create().NativeSessionsEndpoint.AbsolutePath);
    }

    [Fact] // happy path
    public async Task SignIn_WithValidCallback_ReturnsTokens()
    {
        var (auth, authorizeUrl, tokens) = CreateAuthenticator();
        var signIn = auth.SignInAsync(CancellationToken.None);
        var (redirectUri, state) = ParseAuthorizeUrl(await authorizeUrl);

        using var browser = new HttpClient();
        var callback = await browser.GetAsync(
            $"{redirectUri}?code=abc&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.OK, callback.StatusCode);

        var result = await signIn;
        Assert.NotNull(result.Success);
        Assert.Equal("at-123", result.Success!.AccessToken);
        Assert.Equal("rt-456", result.Success.RefreshToken);

        // The code goes to the Elevateo server's native-session exchange as JSON, not to the IdP.
        Assert.Equal(new Uri("https://mail.test.example/v1/native/sessions"), tokens.LastRequest!.RequestUri);
        var tokenBody = await tokens.LastRequest.Content!.ReadAsStringAsync();
        Assert.Contains("\"code\":\"abc\"", tokenBody);
        Assert.Contains("\"code_verifier\":", tokenBody);
        Assert.Contains($"\"redirect_uri\":\"{redirectUri}\"", tokenBody);
    }

    [Fact] // failure path 1: state mismatch is rejected and does not complete the flow
    public async Task SignIn_WithStateMismatch_RejectsCallbackAndKeepsWaiting()
    {
        var (auth, authorizeUrl, _) = CreateAuthenticator();
        using var cts = new CancellationTokenSource();
        var signIn = auth.SignInAsync(cts.Token);
        var (redirectUri, state) = ParseAuthorizeUrl(await authorizeUrl);

        using var browser = new HttpClient();
        var bad = await browser.GetAsync($"{redirectUri}?code=evil&state=wrong-state");
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.False(signIn.IsCompleted); // the attempt is still pending, not hijacked

        var good = await browser.GetAsync($"{redirectUri}?code=abc&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.OK, good.StatusCode);
        var result = await signIn;
        Assert.NotNull(result.Success);
    }

    [Fact] // failure path 2: a second callback with the already-used state is a replay
    public void Validator_ReplayedState_IsRejected()
    {
        var validator = new AuthCallbackValidator("state-1", TimeSpan.FromMinutes(5));

        var first = validator.Validate("state-1", "code-1", null);
        Assert.Equal(CallbackOutcome.Accepted, first.Outcome);
        Assert.Equal("code-1", first.Code);

        var replay = validator.Validate("state-1", "code-2", null);
        Assert.Equal(CallbackOutcome.Replayed, replay.Outcome);
        Assert.Null(replay.Code);
    }

    [Fact] // failure path 2b: expired attempts never accept a code
    public void Validator_ExpiredAttempt_IsRejected()
    {
        var validator = new AuthCallbackValidator("state-1", TimeSpan.FromMilliseconds(-1));
        var result = validator.Validate("state-1", "code-1", null);
        Assert.Equal(CallbackOutcome.Expired, result.Outcome);
    }
}
