using Elevateo.Client.Core.Auth;
using Xunit;

namespace Elevateo.Client.Core.Tests;

// AIDEV-NOTE: WindowsCredentialStore needs a real Windows session; these tests exercise the
// AuthSession/ITokenStore contract through the in-memory double so they run in the Linux container.
public class CredentialStoreTests
{
    [Fact] // happy path: sign-out erases both the access token and the persisted refresh credential
    public void SignOut_ErasesAccessTokenAndRefreshCredential()
    {
        var store = new InMemoryTokenStore();
        var session = new AuthSession(store);
        session.Establish(new SignInSuccess("at", DateTimeOffset.UtcNow.AddMinutes(10), "rt"));
        Assert.True(session.IsSignedIn);
        Assert.Equal("rt", store.ReadRefreshToken());

        session.SignOut();

        Assert.False(session.IsSignedIn);
        Assert.Null(session.AccessToken);
        Assert.Null(store.ReadRefreshToken());
    }

    [Fact] // failure path 1: reading after erase returns none, and erase is idempotent
    public void Read_AfterErase_ReturnsNone()
    {
        var store = new InMemoryTokenStore();
        store.WriteRefreshToken("rt");
        store.Erase();
        store.Erase(); // second erase must not throw

        Assert.Null(store.ReadRefreshToken());
    }

    [Fact] // failure path 2: an empty refresh credential is rejected instead of stored
    public void Write_EmptyToken_Throws()
    {
        var store = new InMemoryTokenStore();
        Assert.Throws<ArgumentException>(() => store.WriteRefreshToken(""));
        Assert.Null(store.ReadRefreshToken());
    }
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Establish_WithoutRefresh_ErasesPreviousCredential(bool previousSession)
    {
        var store = new InMemoryTokenStore();
        var session = new AuthSession(store);
        store.WriteRefreshToken("account-a");
        if (previousSession) session.Establish(new SignInSuccess("a", DateTimeOffset.UtcNow.AddMinutes(5), "account-a"));
        session.Establish(new SignInSuccess("b", DateTimeOffset.UtcNow.AddMinutes(5), null));
        Assert.Equal("b", session.AccessToken);
        Assert.Null(store.ReadRefreshToken());
    }

    [Theory]
    [InlineData("refresh")]
    [InlineData(null)]
    public void Establish_StorageFailure_DoesNotPublishAccessToken(string? refresh)
    {
        var session = new AuthSession(new ThrowingStore());
        Assert.Throws<IOException>(() => session.Establish(new SignInSuccess("b", DateTimeOffset.UtcNow, refresh)));
        Assert.False(session.IsSignedIn);
        Assert.Null(session.AccessToken);
    }

    [Fact]
    public void Establish_EmptyRefresh_PreservesPreviousSession()
    {
        var store = new InMemoryTokenStore();
        var session = new AuthSession(store);
        session.Establish(new SignInSuccess("a", DateTimeOffset.UtcNow, "old"));
        Assert.Throws<ArgumentException>(() => session.Establish(new SignInSuccess("b", DateTimeOffset.UtcNow, "")));
        Assert.Equal("a", session.AccessToken);
        Assert.Equal("old", store.ReadRefreshToken());
    }

    private sealed class ThrowingStore : ITokenStore
    {
        public string? ReadRefreshToken() => null;
        public void WriteRefreshToken(string refreshToken) => throw new IOException("credential storage failed");
        public void Erase() => throw new IOException("credential erase failed");
    }
}
