using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Elevateo.Client.Core.Agents;
using Elevateo.Client.Core.Api;
using Elevateo.Client.Core.Auth;
using Elevateo.Client.Core.Configuration;

namespace Elevateo.Windows.Services;

/// <summary>Composition root: loads config, wires the core library, no hidden singletons elsewhere.</summary>
public sealed class AppServices
{
    public ClientConfiguration Configuration { get; }
    public AuthSession Session { get; }
    public IElevateoApiClient Api { get; }
    public LoopbackAuthenticator Authenticator { get; }
    public IAgentsBridge AgentsBridge { get; }

    private AppServices(ClientConfiguration config)
    {
        Configuration = config;
        ITokenStore store = OperatingSystem.IsWindows()
            ? new WindowsCredentialStore()
            : new InMemoryTokenStore(); // non-Windows dev runs only; never ships as the Windows default
        Session = new AuthSession(store);
        var handler = new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(5) };
        Api = new ElevateoApiClient(handler, config, () => Session.AccessToken);
        Authenticator = new LoopbackAuthenticator(config, OpenSystemBrowserAsync, handler);
        AgentsBridge = new UnavailableAgentsBridge();
    }

    public static AppServices Create()
    {
        var settingsPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(settingsPath));
        var root = doc.RootElement;

        string Read(string name) =>
            root.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String
                ? el.GetString()!
                : throw new InvalidDataException($"appsettings.json is missing required string '{name}'.");

        // AIDEV-NOTE: ELEVATEO_API_BASE_URL overrides the packaged placeholder; no secrets live here.
        var apiBase = Environment.GetEnvironmentVariable("ELEVATEO_API_BASE_URL") ?? Read("apiBaseUrl");
        return new AppServices(ClientConfiguration.Create(
            apiBase,
            Environment.GetEnvironmentVariable("ELEVATEO_OIDC_AUTHORIZE_URL") ?? Read("oidcAuthorizeEndpoint"),
            Environment.GetEnvironmentVariable("ELEVATEO_OIDC_TOKEN_URL") ?? Read("oidcTokenEndpoint"),
            Environment.GetEnvironmentVariable("ELEVATEO_OIDC_CLIENT_ID") ?? Read("oidcClientId")));
    }

    private static Task OpenSystemBrowserAsync(Uri url)
    {
        // UseShellExecute routes through the OS default browser (RFC 8252 system-browser requirement).
        Process.Start(new ProcessStartInfo { FileName = url.ToString(), UseShellExecute = true });
        return Task.CompletedTask;
    }
}
