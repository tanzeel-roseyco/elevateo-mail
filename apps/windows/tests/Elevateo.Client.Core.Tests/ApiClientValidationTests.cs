using System.Net;
using System.Text.Json.Nodes;
using Elevateo.Client.Core.Api;
using Elevateo.Client.Core.Configuration;
using Xunit;

namespace Elevateo.Client.Core.Tests;

public class ApiClientValidationTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ResponseRequiresValidUtf8(bool corrupt)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(SessionJson.Replace("Test User", "é", StringComparison.Ordinal));
        if (corrupt) bytes[Array.IndexOf(bytes, (byte)0xc3)] = 0xff;
        using var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        { Content = new ByteArrayContent(bytes) });
        using var client = new ElevateoApiClient(handler, TestConfig.Create(), () => "token");
        var result = await client.GetSessionAsync(default);
        if (corrupt) Assert.Equal(ApiErrorKind.InvalidResponse, result.Error!.Kind);
        else Assert.Equal("é", result.Value!.Actor.DisplayName);
    }

    [Theory]
    [InlineData("context_id")]
    [InlineData("authorization_version")]
    public async Task ListThreads_RejectsMismatchedSessionMetadata(string property)
    {
        var json = JsonNode.Parse(ThreadPageJson)!;
        json[property] = "different_0123456789abcdef";
        using var handler = new StubHandler(req => StubHandler.Json(HttpStatusCode.OK,
            req.RequestUri!.AbsolutePath == "/v1/session" ? SessionJson : json.ToJsonString()));
        using var client = await BootstrappedClientAsync(handler);
        var result = await client.ListThreadsAsync("7e6c1f4e-0000-4000-8000-000000000003", null, default);
        Assert.Equal(ApiErrorKind.ContextChanged, result.Error!.Kind);
        Assert.Null(result.Value);
    }

    // AIDEV-NOTE: mutate otherwise valid payloads so each null/boundary regression isolates one contract violation.
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
        var payload = JsonNode.Parse(ThreadPageJson)!.AsObject();
        payload.Remove("items");
        var missingItems = payload.ToJsonString();
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

    [Theory]
    [InlineData("actor")]
    [InlineData("organization")]
    [InlineData("context_id")]
    [InlineData("csrf_token")]
    public async Task Session_ExplicitNull_ReturnsInvalidResponse(string property)
    {
        var json = JsonNode.Parse(SessionJson)!;
        json[property] = null;
        using var client = new ElevateoApiClient(new StubHandler(_ => StubHandler.Json(HttpStatusCode.OK,
            json.ToJsonString())), TestConfig.Create(), () => "token");
        Assert.Equal(ApiErrorKind.InvalidResponse, (await client.GetSessionAsync(default)).Error!.Kind);
    }

    [Theory]
    [InlineData("items")]
    [InlineData("item")]
    [InlineData("capabilities")]
    [InlineData("display_name")]
    [InlineData("read_false")]
    public async Task Mailboxes_ExplicitNull_ReturnsInvalidResponse(string property)
    {
        var json = JsonNode.Parse("""
            {"context_id":"ctx_0123456789abcdef","authorization_version":"ver_0123456789abcdef",
             "next_cursor":null,"items":[{"id":"7e6c1f4e-0000-4000-8000-000000000003","display_name":"Inbox","display_address":null,
             "capabilities":{"read":true,"compose":true,"approve_send":false,"manage_members":false}}]}
            """)!;
        if (property == "items") json["items"] = null;
        else if (property == "item") json["items"]![0] = null;
        else if (property == "read_false") json["items"]![0]!["capabilities"]!["read"] = false;
        else json["items"]![0]![property] = null;
        var handler = new StubHandler(req => StubHandler.Json(HttpStatusCode.OK,
            req.RequestUri!.AbsolutePath == "/v1/session" ? SessionJson : json.ToJsonString()));
        using var client = await BootstrappedClientAsync(handler);
        Assert.Equal(ApiErrorKind.InvalidResponse, (await client.ListMailboxesAsync(null, default)).Error!.Kind);
    }

    [Theory]
    [InlineData("items")]
    [InlineData("item")]
    [InlineData("preview_text")]
    [InlineData("over_limit")]
    [InlineData("negative_count")]
    public async Task Threads_InvalidNestedValues_ReturnInvalidResponse(string mutation)
    {
        var json = JsonNode.Parse(ThreadPageJson)!;
        if (mutation == "items") json["items"] = null;
        else if (mutation == "item") json["items"]![0] = null;
        else if (mutation == "preview_text") json["items"]![0]!["preview_text"] = null;
        else if (mutation == "negative_count") json["items"]![0]!["message_count"] = -1;
        else
        {
            var item = json["items"]![0]!.DeepClone();
            json["items"] = new JsonArray(Enumerable.Range(0, 51).Select(_ => item.DeepClone()).ToArray());
        }
        var handler = new StubHandler(req => StubHandler.Json(HttpStatusCode.OK,
            req.RequestUri!.AbsolutePath == "/v1/session" ? SessionJson : json.ToJsonString()));
        using var client = await BootstrappedClientAsync(handler);
        Assert.Equal(ApiErrorKind.InvalidResponse, (await client.ListThreadsAsync("mbx", null, default)).Error!.Kind);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(50)]
    public async Task Threads_ValidCollectionBounds_ReturnSuccess(int count)
    {
        var json = JsonNode.Parse(ThreadPageJson)!;
        var item = json["items"]![0]!.DeepClone();
        json["items"] = new JsonArray(Enumerable.Range(0, count).Select(_ => item.DeepClone()).ToArray());
        var handler = new StubHandler(req => StubHandler.Json(HttpStatusCode.OK,
            req.RequestUri!.AbsolutePath == "/v1/session" ? SessionJson : json.ToJsonString()));
        using var client = await BootstrappedClientAsync(handler);
        Assert.Equal(count, (await client.ListThreadsAsync("mbx", null, default)).Value!.Items.Count);
    }

    [Theory]
    [InlineData("2026-10-29 10:00:00Z", false)]
    [InlineData("2026-10-29T10:00Z", false)]
    [InlineData("2026-02-30T10:00:00Z", false)]
    [InlineData("2026-10-29T10:00:00.Z", false)]
    [InlineData("2026-10-29T10:00:00+00:00", false)]
    [InlineData("2026-10-29T10:00:00Z", true)]
    [InlineData("2026-10-29T10:00:00.123456789Z", true)]
    public async Task Threads_TimestampsRequireUtcWireFormat(string timestamp, bool valid)
    {
        var json = JsonNode.Parse(ThreadPageJson)!;
        json["items"]![0]!["last_message_at"] = timestamp;
        var handler = new StubHandler(req => StubHandler.Json(HttpStatusCode.OK,
            req.RequestUri!.AbsolutePath == "/v1/session" ? SessionJson : json.ToJsonString()));
        using var client = await BootstrappedClientAsync(handler);
        var result = await client.ListThreadsAsync("mbx", null, default);
        Assert.Equal(valid, result.IsSuccess);
        if (!valid) Assert.Equal(ApiErrorKind.InvalidResponse, result.Error!.Kind);
    }

    [Theory]
    [InlineData("io")]
    [InlineData("http")]
    [InlineData("timeout")]
    public async Task BodyReadFailure_ReturnsUnavailable(string failure)
    {
        using var client = StreamingClient(failure);
        var result = await client.GetSessionAsync(default).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(ApiErrorKind.Unavailable, result.Error!.Kind);
    }

    [Theory]
    [InlineData("thread")]
    [InlineData("messages")]
    [InlineData("message")]
    [InlineData("to")]
    [InlineData("recipient")]
    [InlineData("body_text")]
    public async Task Messages_ExplicitNull_ReturnsInvalidResponse(string mutation)
    {
        var thread = JsonNode.Parse(ThreadPageJson)!["items"]![0]!.DeepClone();
        thread["mailbox_id"] = "7e6c1f4e-0000-4000-8000-000000000003";
        var json = JsonNode.Parse("""
            {"context_id":"ctx_0123456789abcdef","authorization_version":"ver_0123456789abcdef",
             "next_cursor":null,"thread":null,"messages":[{"id":"7e6c1f4e-0000-4000-8000-000000000005","sender":null,"sent_at":null,
             "to":[{"display_name":null,"address":"a@example.com"}],"body_text":"hello",
             "body_truncated":false,"attachment_count":0}]}
            """)!;
        json["thread"] = thread;
        using var baseline = await BootstrappedClientAsync(new StubHandler(req => StubHandler.Json(HttpStatusCode.OK,
            req.RequestUri!.AbsolutePath == "/v1/session" ? SessionJson : json.ToJsonString())));
        Assert.True((await baseline.GetThreadAsync("thread", "mailbox", null, default)).IsSuccess);
        if (mutation is "thread" or "messages") json[mutation] = null;
        else if (mutation == "message") json["messages"]![0] = null;
        else if (mutation == "recipient") json["messages"]![0]!["to"]![0] = null;
        else json["messages"]![0]![mutation] = null;
        var handler = new StubHandler(req => StubHandler.Json(HttpStatusCode.OK,
            req.RequestUri!.AbsolutePath == "/v1/session" ? SessionJson : json.ToJsonString()));
        using var client = await BootstrappedClientAsync(handler);
        Assert.Equal(ApiErrorKind.InvalidResponse, (await client.GetThreadAsync("thread", "mailbox", null, default)).Error!.Kind);
    }

    [Theory]
    [InlineData("draft_id")]
    [InlineData("operation_id")]
    [InlineData("state")]
    public async Task DraftResult_ExplicitNull_ReturnsInvalidResponse(string property)
    {
        var json = JsonNode.Parse("""
            {"draft_id":"7e6c1f4e-0000-4000-8000-000000000005",
             "operation_id":"7e6c1f4e-0000-4000-8000-000000000006","version":1,"state":"editable"}
            """)!;
        json[property] = null;
        var handler = new StubHandler(req => StubHandler.Json(HttpStatusCode.OK,
            req.RequestUri!.AbsolutePath == "/v1/session" ? SessionJson : json.ToJsonString()));
        using var client = await BootstrappedClientAsync(handler);
        var input = new DraftSaveInput { MailboxId = "mailbox", OperationId = "operation", ExpectedVersion = 0,
            Subject = "", To = [], BodyText = "" };
        Assert.Equal(ApiErrorKind.InvalidResponse, (await client.SaveDraftAsync("draft", input, default)).Error!.Kind);
    }

    [Fact]
    public async Task BodyReadCallerCancellation_Propagates()
    {
        using var client = StreamingClient("timeout");
        using var cts = new CancellationTokenSource();
        var pending = client.GetSessionAsync(cts.Token);
        cts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending);
    }

    private static ElevateoApiClient StreamingClient(string failure) => new(new StubHandler(_ =>
        new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new FailingStream(failure)) }),
        ClientConfiguration.Create("https://mail.test.example", "https://mail.test.example/authorize", "test",
            TimeSpan.FromMilliseconds(100)), () => "token");

    private sealed class FailingStream(string failure) : MemoryStream
    {
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (failure == "io") throw new IOException("Connection dropped");
            if (failure == "http") throw new HttpRequestException("Connection dropped");
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            return 0;
        }
    }
}
