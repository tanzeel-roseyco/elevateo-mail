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
}
