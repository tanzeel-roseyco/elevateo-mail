using System.Runtime.CompilerServices;
using Elevateo.Client.Core.Agents;
using Elevateo.Client.Core.Auth;
using Elevateo.Windows.Services;
using Elevateo.Windows.ViewModels;
using Xunit;

namespace Elevateo.Client.Core.Tests;

public sealed class AssistantResetTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RuntimeSwitchInvalidatesCompletedOrPendingSession(bool pendingOutput)
    {
        var bridge = new DelayedBridge();
        bridge.Start.SetResult("session");
        if (!pendingOutput) bridge.Output.SetResult(new AgentEvent(AgentEventKind.Output, "answer"));
        var config = TestConfig.Create();
        using var handler = new StubHandler(_ => throw new InvalidOperationException("No HTTP expected"));
        using var vm = new AssistantViewModel(new AppServices(config,
            new AuthSession(new InMemoryTokenStore()), new ViewModelApi(),
            new LoopbackAuthenticator(config, _ => Task.CompletedTask, handler), bridge));
        vm.Input = "first";
        var first = vm.SendCommand.ExecuteAsync(null);
        if (!pendingOutput) await first;
        vm.SelectedRuntime = "Claude";
        if (pendingOutput) bridge.Output.SetResult(new AgentEvent(AgentEventKind.Output, "answer"));
        await first.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Empty(vm.Transcript);
        vm.Input = "second";
        await vm.SendCommand.ExecuteAsync(null);
        Assert.Collection(bridge.Started, value => Assert.Equal(AgentRuntime.Codex, value),
            value => Assert.Equal(AgentRuntime.Claude, value));
        Assert.Collection(bridge.Sessions, value => Assert.Equal("Codex-session", value),
            value => Assert.Equal("Claude-session", value));
        Assert.Equal("Claude", vm.Transcript.Last().Speaker);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task ResetRejectsLateSessionAndStreamOutput(bool duringStart)
    {
        var bridge = new DelayedBridge();
        var config = TestConfig.Create();
        using var handler = new StubHandler(_ => throw new InvalidOperationException("No HTTP expected"));
        using var vm = new AssistantViewModel(new AppServices(config,
            new AuthSession(new InMemoryTokenStore()), new ViewModelApi(),
            new LoopbackAuthenticator(config, _ => Task.CompletedTask, handler), bridge));
        if (!duringStart) bridge.Start.SetResult("old-session");
        vm.Input = "private prompt";
        var pending = vm.SendCommand.ExecuteAsync(null);
        vm.Reset();
        if (duringStart) bridge.Start.SetResult("old-session");
        bridge.Output.SetResult(new AgentEvent(AgentEventKind.Output, "private late output"));
        await pending.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Empty(vm.Transcript);
        Assert.Empty(vm.Input);
        Assert.False(vm.Busy);
        Assert.Equal(!duringStart, bridge.StreamStarted);
    }

    // AIDEV-NOTE: ignore cancellation deliberately to prove reset rejects stale adapter completions.
    private sealed class DelayedBridge : IAgentsBridge
    {
        public TaskCompletionSource<string> Start { get; } = new();
        public TaskCompletionSource<AgentEvent> Output { get; } = new();
        public bool StreamStarted { get; private set; }
        public List<AgentRuntime> Started { get; } = new();
        public List<string> Sessions { get; } = new();
        public AgentsUnavailable? CheckAvailability(AgentRuntime runtime) => null;
        public async Task<string> StartSessionAsync(AgentRuntime runtime, CancellationToken ct)
        {
            Started.Add(runtime);
            return runtime + "-" + await Start.Task;
        }
        public async IAsyncEnumerable<AgentEvent> SendAsync(string sessionId, string message,
            [EnumeratorCancellation] CancellationToken ct)
        {
            StreamStarted = true;
            Sessions.Add(sessionId);
            yield return await Output.Task;
        }
        public Task CancelAsync(string sessionId) => Task.CompletedTask;
        public Task EndSessionAsync(string sessionId) => Task.CompletedTask;
    }
}
