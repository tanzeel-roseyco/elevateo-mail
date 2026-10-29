using System.Net;
using Elevateo.Client.Core.Api;
using Xunit;

namespace Elevateo.Client.Core.Tests;

public class ApiClientValidationTests
{
    private const string SessionJson = """
        {"context_id":"ctx_0123456789abcdef","authorization_version":"ver_0123456789abcdef",
         "actor":{"id":"7e6c1f4e-0000-4000-8000-000000000001","display_name":"Test User"},
         "organization":{"id":"7e6c1f4e-0000-4000-8000-000000000002","name":"Elevateo"},
         "simulation_mode":true,"csrf_token":"csrf_0123456789abcdef"}
        """;

    private const string ThreadPageJson = """
        {"context_id":"ctx_0123456789abcdef","authorization_version":"ver_0123456789abcdef",
         "next_cursor":null,"mailbox_id":"7e6c1f4e-0000-4000-8000-000000000003",
         "items":[{"id":"7e6c1f4e-0000-4000-8000-000000000004",
                   "mailbox_id":"7e6c1f4e-0000-4000-8000-000000000003",
                   "subject":"Hello","subject_truncated":false,
                   "sender":{"display_name":"Ann","address":"ann@example.com"},
                   "preview_text":"Hi there","last_message_at":"2026-10-29T10:00:00Z",
                   "unread":true,"message_count":2,"folder":"inbox",
                   "snoozed_until":null,"starred":false}]}
        """;

    private static async Task<ElevateoApiClient> BootstrappedClientAsync(StubHandler handler)
    {
        var client = new ElevateoApiClient(handler, TestConfig.Create(), () => "token");
        var session = await client.GetSessionAsync(CancellationToken.None);
        Assert.True(session.IsSuccess);
        return client;
    }

    [Fact] // happy path: a contract-conforming thread page parses and context headers are sent
    public async Task ListThreads_WithValidResponse_ReturnsPage()
    {
        var handler = new StubHandler(req =>
            req.RequestUri!.AbsolutePath == "/v1/session"
                ? StubHandler.Json(HttpStatusCode.OK, SessionJson)
                : StubHandler.Json(HttpStatusCode.OK, ThreadPageJson));
        var client = await BootstrappedClientAsync(handler);

        var result = await client.ListThreadsAsync("7e6c1f4e-0000-4000-8000-000000000003", null, CancellationToken.None);

        Assert.True(result.IsSuccess);
        var item = Assert.Single(result.Value!.Items);
        Assert.Equal("Hello", item.Subject);
        Assert.True(item.Unread);
        Assert.Equal("ctx_0123456789abcdef",
            handler.LastRequest!.Headers.GetValues("X-Session-Context").Single());
    }

    [Fact] // failure path 1: malformed/non-conforming JSON becomes a typed InvalidResponse error
    public async Task ListThreads_WithMalformedJson_ReturnsInvalidResponse()
    {
        var handler = new StubHandler(req =>
            req.RequestUri!.AbsolutePath == "/v1/session"
                ? StubHandler.Json(HttpStatusCode.OK, SessionJson)
                : StubHandler.Json(HttpStatusCode.OK, """{"items": [ {"id": "x" """));
        var client = await BootstrappedClientAsync(handler);

        var result = await client.ListThreadsAsync("mbx", null, CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(ApiErrorKind.InvalidResponse, result.Error!.Kind);
    }

    [Fact] // failure path 1b: a field the contract requires may not be silently missing
    public async Task ListThreads_WithMissingRequiredField_ReturnsInvalidResponse()
    {
        var missingItems = """{"context_id":"ctx_0123456789abcdef","authorization_version":"ver_0123456789abcdef","next_cursor":null,"mailbox_id":"m"}""";
        var handler = new StubHandler(req =>
            req.RequestUri!.AbsolutePath == "/v1/session"
                ? StubHandler.Json(HttpStatusCode.OK, SessionJson)
                : StubHandler.Json(HttpStatusCode.OK, missingItems));
        var client = await BootstrappedClientAsync(handler);

        var result = await client.ListThreadsAsync("mbx", null, CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(ApiErrorKind.InvalidResponse, result.Error!.Kind);
    }

    [Fact] // failure path 2: 401 maps to SessionExpired so the UI can clear state and re-sign-in
    public async Task ListThreads_With401_ReturnsSessionExpired()
    {
        var handler = new StubHandler(req =>
            req.RequestUri!.AbsolutePath == "/v1/session"
                ? StubHandler.Json(HttpStatusCode.OK, SessionJson)
                : StubHandler.Json(HttpStatusCode.Unauthorized,
                    """{"code":"unauthenticated","message":"expired","request_id":"req-1"}"""));
        var client = await BootstrappedClientAsync(handler);

        var result = await client.ListThreadsAsync("mbx", null, CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(ApiErrorKind.SessionExpired, result.Error!.Kind);
        Assert.Equal("req-1", result.Error.RequestId);
    }
}
