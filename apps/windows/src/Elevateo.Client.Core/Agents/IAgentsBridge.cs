namespace Elevateo.Client.Core.Agents;

public enum AgentRuntime
{
    Codex,
    Claude,
}

public enum AgentEventKind
{
    /// <summary>Plain-text assistant output chunk.</summary>
    Output,
    /// <summary>Runtime finished responding to the last message.</summary>
    Completed,
    /// <summary>Runtime reported an error; Text carries a safe description.</summary>
    Error,
}

public sealed record AgentEvent(AgentEventKind Kind, string Text);

/// <summary>Why the bridge cannot start a session right now; shown verbatim in the UI.</summary>
public sealed record AgentsUnavailable(string Reason);

/// <summary>
/// Port for the in-app assistant panel over local Codex / Claude runtime process adapters.
/// AIDEV-NOTE: contract-request — the native process adapters are owned by another team; this port
/// defines the shape the Windows client consumes. Permissions are fixed read/search/draft only.
/// </summary>
public interface IAgentsBridge
{
    /// <summary>Null when sessions can start; otherwise the honest reason the panel must show.</summary>
    AgentsUnavailable? CheckAvailability(AgentRuntime runtime);

    /// <summary>Starts a session; returns an opaque session id.</summary>
    Task<string> StartSessionAsync(AgentRuntime runtime, CancellationToken ct);

    /// <summary>Sends a user message; events stream until a Completed or Error event.</summary>
    IAsyncEnumerable<AgentEvent> SendAsync(string sessionId, string message, CancellationToken ct);

    /// <summary>Cancels the in-flight response for the session, if any.</summary>
    Task CancelAsync(string sessionId);

    Task EndSessionAsync(string sessionId);
}

/// <summary>Stub used until the native adapters ship. Honest: every runtime reports unavailable.</summary>
public sealed class UnavailableAgentsBridge : IAgentsBridge
{
    private const string Reason =
        "The local assistant runtime is not installed in this build. Codex and Claude adapters ship separately.";

    public AgentsUnavailable? CheckAvailability(AgentRuntime runtime) => new(Reason);

    public Task<string> StartSessionAsync(AgentRuntime runtime, CancellationToken ct) =>
        Task.FromException<string>(new InvalidOperationException(Reason));

    public IAsyncEnumerable<AgentEvent> SendAsync(string sessionId, string message, CancellationToken ct) =>
        throw new InvalidOperationException(Reason);

    public Task CancelAsync(string sessionId) => Task.CompletedTask;

    public Task EndSessionAsync(string sessionId) => Task.CompletedTask;
}
