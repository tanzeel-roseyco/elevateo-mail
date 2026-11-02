using System.ComponentModel;
using System.Net;
using System.Web;
using Elevateo.Client.Core.Agents;
using Elevateo.Client.Core.Auth;
using Elevateo.Windows.Services;
using Elevateo.Windows.ViewModels;
using Xunit;

namespace Elevateo.Client.Core.Tests;

public sealed class CredentialUiTests
{
    [Fact]
    public async Task CancelledBootstrapErasesEstablishedCredentials()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var launch = new TaskCompletionSource<Uri>();
        var bootstrap = new TaskCompletionSource();
        var store = new InMemoryTokenStore();
        var session = new AuthSession(store);
        var config = TestConfig.Create();
        var api = new ViewModelApi { Session = async ct =>
        {
            bootstrap.SetResult();
            await Task.Delay(Timeout.Infinite, ct);
            throw new InvalidOperationException("Cancellation must interrupt bootstrap");
        } };
        using var handler = new StubHandler(_ => StubHandler.Json(HttpStatusCode.OK,
            "{\"access_token\":\"valid-token\",\"token_type\":\"Bearer\",\"expires_in\":3600,\"refresh_token\":\"refresh\"}"));
        var auth = new LoopbackAuthenticator(config, uri => { launch.SetResult(uri); return Task.CompletedTask; }, handler);
        using var vm = new MainViewModel(new AppServices(config, session, api, auth, new UnavailableAgentsBridge()));
        var signIn = vm.SignInCommand.ExecuteAsync(null);
        try
        {
            var query = HttpUtility.ParseQueryString((await launch.Task.WaitAsync(deadline.Token)).Query);
            using var browser = new HttpClient();
            using var response = await browser.GetAsync(query["redirect_uri"] + "?code=code&state="
                + Uri.EscapeDataString(query["state"]!), deadline.Token);
            await bootstrap.Task.WaitAsync(deadline.Token);
            Assert.True(session.IsSignedIn);
            vm.SignInCommand.Cancel();
            await signIn.WaitAsync(deadline.Token);
            Assert.False(session.IsSignedIn);
            Assert.Null(store.ReadRefreshToken());
            Assert.False(vm.IsSignedIn);
        }
        finally
        {
            vm.SignInCommand.Cancel();
            await signIn.WaitAsync(TimeSpan.FromSeconds(2));
        }
    }

    [Fact]
    public async Task CredentialWriteFailureIsVisibleWithoutPublishingSession()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var launch = new TaskCompletionSource<Uri>();
        var config = TestConfig.Create();
        var session = new AuthSession(new FailingStore());
        using var handler = new StubHandler(_ => StubHandler.Json(HttpStatusCode.OK,
            "{\"access_token\":\"valid-token\",\"token_type\":\"Bearer\",\"expires_in\":3600,\"refresh_token\":\"refresh\"}"));
        var auth = new LoopbackAuthenticator(config, uri => { launch.SetResult(uri); return Task.CompletedTask; }, handler);
        using var vm = new MainViewModel(new AppServices(config, session, new ViewModelApi(), auth,
            new UnavailableAgentsBridge()));
        var signIn = vm.SignInCommand.ExecuteAsync(null);
        try
        {
            await Task.WhenAny(launch.Task, signIn).WaitAsync(deadline.Token);
            if (!launch.Task.IsCompleted) await signIn;
            var query = HttpUtility.ParseQueryString((await launch.Task.WaitAsync(deadline.Token)).Query);
            using var browser = new HttpClient();
            using var response = await browser.GetAsync(query["redirect_uri"] + "?code=code&state="
                + Uri.EscapeDataString(query["state"]!), deadline.Token);
            await signIn.WaitAsync(deadline.Token);
            Assert.False(vm.IsSignedIn);
            Assert.False(session.IsSignedIn);
            Assert.Contains("Credential Manager", vm.SignInError, StringComparison.Ordinal);
            Assert.False(vm.SignInBusy);
        }
        finally
        {
            vm.SignInCommand.Cancel();
            await signIn.WaitAsync(TimeSpan.FromSeconds(2));
        }
    }

    [Fact]
    public void CredentialEraseFailureStillClearsPrivateUiAndReportsFailure()
    {
        var config = TestConfig.Create();
        using var handler = new StubHandler(_ => throw new InvalidOperationException("No HTTP expected"));
        using var vm = new MainViewModel(new AppServices(config, new AuthSession(new FailingStore()),
            new ViewModelApi(), new LoopbackAuthenticator(config, _ => Task.CompletedTask, handler),
            new UnavailableAgentsBridge()));
        vm.IsSignedIn = true;
        vm.ComposerBody = "secret";
        vm.SignOutCommand.Execute(null);
        Assert.False(vm.IsSignedIn);
        Assert.Empty(vm.ComposerBody);
        Assert.Contains("could not erase", vm.SignInError, StringComparison.Ordinal);
    }

    // AIDEV-NOTE: match Credential Manager's production exception type without invoking Windows APIs in Docker.
    private sealed class FailingStore : ITokenStore
    {
        public string? ReadRefreshToken() => null;
        public void WriteRefreshToken(string refreshToken) => throw new Win32Exception("write failed");
        public void Erase() => throw new Win32Exception("erase failed");
    }
}
