using System.Net;
using System.Text.Json;
using System.Web;
using Elevateo.Client.Core.Auth;
using Elevateo.Client.Core.Configuration;
using Xunit;

namespace Elevateo.Client.Core.Tests;

public class AuthFlowTests
{
    [Fact]
    public void ObservedExpiryRemainsTerminalAfterClockRewinds()
    {
        var clock = new AdjustableClock();
        var validator = new AuthCallbackValidator("state", TimeSpan.FromMinutes(1), clock);
        clock.Now = clock.Now.AddMinutes(2);
        Assert.Equal(CallbackOutcome.Expired, validator.Validate("state", "code", null).Outcome);
        clock.Now = clock.Now.AddMinutes(-2);
        Assert.Equal(CallbackOutcome.Replayed, validator.Validate("state", "code", null).Outcome);
    }

    private sealed class AdjustableClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UnixEpoch;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private const string TokenJson =
        """{"access_token":"at-123","token_type":"Bearer","expires_in":600,"refresh_token":"rt-456"}""";

    private static (LoopbackAuthenticator Auth, Task<Uri> AuthorizeUrl, StubHandler Tokens) CreateAuthenticator(
        string tokenJson = TokenJson, HttpStatusCode status = HttpStatusCode.OK)
    {
        var urlSource = new TaskCompletionSource<Uri>(TaskCreationOptions.RunContinuationsAsynchronously);
        var tokens = new StubHandler(_ => StubHandler.Json(status, tokenJson));
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

    [Theory]
    [InlineData(HttpStatusCode.OK)]
    [InlineData(HttpStatusCode.BadGateway)]
    public async Task SignInRejectsOversizedExchangeResponse(HttpStatusCode status)
    {
        // AIDEV-NOTE: otherwise valid JSON must fail during bounded transport, not parsing or HTTP status handling.
        var oversized = TokenJson[..^1] + ",\"padding\":\"" + new string('x', 65_537) + "\"}";
        var (auth, url, _) = CreateAuthenticator(oversized, status);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var signIn = auth.SignInAsync(cts.Token);
        try
        {
            var (redirect, state) = ParseAuthorizeUrl(await AwaitAuthorizeAsync(url, signIn));
            using var browser = new HttpClient();
            using var response = await browser.GetAsync($"{redirect}?code=abc&state={state}");
            Assert.Equal("Could not reach the sign-in service.", (await signIn).Failure?.Reason);
        }
        finally
        {
            await cts.CancelAsync();
            try { await signIn; } catch (OperationCanceledException) { }
        }
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
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var signIn = auth.SignInAsync(cts.Token);
        try
        {
        var (redirectUri, state) = ParseAuthorizeUrl(await AwaitAuthorizeAsync(authorizeUrl, signIn));

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
        var tokenBody = tokens.LastRequestBody!;
        Assert.Contains("\"code\":\"abc\"", tokenBody);
        Assert.Contains("\"code_verifier\":", tokenBody);
        Assert.Contains($"\"redirect_uri\":\"{redirectUri}\"", tokenBody);
        }
        finally
        {
            await cts.CancelAsync();
            try { await signIn; } catch (OperationCanceledException) { }
        }
    }

    [Fact] // failure path 1: state mismatch is rejected and does not complete the flow
    public async Task SignIn_WithStateMismatch_RejectsCallbackAndKeepsWaiting()
    {
        var (auth, authorizeUrl, _) = CreateAuthenticator();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var signIn = auth.SignInAsync(cts.Token);
        try
        {
        var (redirectUri, state) = ParseAuthorizeUrl(await AwaitAuthorizeAsync(authorizeUrl, signIn));

        using var browser = new HttpClient();
        var bad = await browser.GetAsync($"{redirectUri}?code=evil&state=wrong-state");
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.False(signIn.IsCompleted); // the attempt is still pending, not hijacked

        var good = await browser.GetAsync($"{redirectUri}?code=abc&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.OK, good.StatusCode);
        var result = await signIn;
        Assert.NotNull(result.Success);
        }
        finally
        {
            await cts.CancelAsync();
            try { await signIn; } catch (OperationCanceledException) { }
        }
    }

    private static async Task<Uri> AwaitAuthorizeAsync(Task<Uri> url, Task<SignInResult> signIn)
    {
        var completed = await Task.WhenAny(url, signIn).WaitAsync(TimeSpan.FromSeconds(5));
        if (completed == signIn)
        {
            await signIn; // expose listener/launcher failure instead of hanging on the URL source
            throw new InvalidOperationException("Sign-in ended before opening the browser.");
        }
        return await url;
    }

    [Fact]
    public async Task AwaitAuthorize_PropagatesEarlyFailure()
    {
        var url = new TaskCompletionSource<Uri>();
        var failure = Task.FromException<SignInResult>(new IOException("listener failed"));
        var error = await Assert.ThrowsAsync<IOException>(() => AwaitAuthorizeAsync(url.Task, failure));
        Assert.Equal("listener failed", error.Message);
    }

    [Theory]
    [InlineData("at-123", "")]
    [InlineData("at\\n123", "refresh")]
    public async Task SignIn_RejectsMalformedTokens(string access, string refresh)
    {
        var json = "{\"access_token\":\"" + access + "\",\"token_type\":\"Bearer\",\"expires_in\":600,\"refresh_token\":\"" + refresh + "\"}";
        var (auth, url, _) = CreateAuthenticator(json);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var signIn = auth.SignInAsync(cts.Token);
        try
        {
            var (redirect, state) = ParseAuthorizeUrl(await AwaitAuthorizeAsync(url, signIn));
            using var browser = new HttpClient();
            using var response = await browser.GetAsync($"{redirect}?code=abc&state={state}");
            Assert.NotNull((await signIn).Failure?.Reason);
        }
        finally
        {
            await cts.CancelAsync();
            try { await signIn; } catch (OperationCanceledException) { }
        }
    }

    [Theory]
    [InlineData("GET /other?state=s&code=c HTTP/1.1\r\n\r\n")]
    [InlineData("POST /callback?state=s&code=c HTTP/1.1\r\n\r\n")]
    public async Task CallbackParser_RejectsWrongRouteOrMethod(string request)
    {
        using var stream = new MemoryStream(System.Text.Encoding.ASCII.GetBytes(request));
        Assert.Null(await LoopbackAuthenticator.ReadCallbackTargetAsync(stream, CancellationToken.None));
    }

    [Fact]
    public async Task CallbackParser_RejectsOversizedHeaders()
    {
        using var stream = new MemoryStream(System.Text.Encoding.ASCII.GetBytes(new string('x', 16_385)));
        Assert.Null(await LoopbackAuthenticator.ReadCallbackTargetAsync(stream, CancellationToken.None));
        Assert.Equal(16_384, stream.Position);
    }

    [Theory]
    [InlineData(CallbackOutcome.Accepted)]
    [InlineData(CallbackOutcome.StateMismatch)]
    public async Task CallbackAcknowledgement_DisconnectedBrowser_DoesNotAbort(CallbackOutcome outcome)
    {
        using var stream = new DisconnectedStream();
        await LoopbackAuthenticator.RespondAsync(stream, outcome, CancellationToken.None);
    }

    private sealed class DisconnectedStream : MemoryStream
    {
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
            => ValueTask.FromException(new IOException("browser disconnected"));
    }

    [Theory]
    [InlineData("https://mail.test.example/mail-api")]
    [InlineData("https://mail.test.example/mail-api/")]
    public void Configuration_PreservesApiPathPrefix(string apiBase)
    {
        var config = ClientConfiguration.Create(apiBase, "https://id.test.example/authorize", "client");
        Assert.Equal("/mail-api/v1/native/sessions", config.NativeSessionsEndpoint.AbsolutePath);
        Assert.Equal("/mail-api/v1/session", new Uri(config.ApiBaseUri, "v1/session").AbsolutePath);
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
