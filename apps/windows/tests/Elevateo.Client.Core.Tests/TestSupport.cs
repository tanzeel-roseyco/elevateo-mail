using System.Net;
using System.Text;
using Elevateo.Client.Core.Configuration;

namespace Elevateo.Client.Core.Tests;

/// <summary>Deterministic HttpMessageHandler: each request is answered by the queued responder.</summary>
public sealed class StubHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;

    public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) => _responder = responder;

    public HttpRequestMessage? LastRequest { get; private set; }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        LastRequest = request;
        return Task.FromResult(_responder(request));
    }

    public static HttpResponseMessage Json(HttpStatusCode status, string body) => new(status)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json"),
    };
}

public static class TestConfig
{
    public static ClientConfiguration Create() => ClientConfiguration.Create(
        "https://mail.test.example",
        "https://mail.test.example/application/o/authorize/",
        "elevateo-windows-desktop",
        TimeSpan.FromSeconds(10));
}
