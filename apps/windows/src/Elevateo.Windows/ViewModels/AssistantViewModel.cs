using System;
using System.Collections.ObjectModel;
using System.Threading;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Elevateo.Client.Core.Agents;
using Elevateo.Windows.Services;

namespace Elevateo.Windows.ViewModels;

public sealed record TranscriptLine(string Speaker, string Text);

/// <summary>
/// Assistant side panel: runtime picker, plain-text transcript, cancel, honest unavailable state.
/// AIDEV-NOTE: with UnavailableAgentsBridge the panel stays disabled and shows the reason — it never
/// fakes a working assistant. Real adapters only replace the bridge, not this view model.
/// </summary>
public partial class AssistantViewModel : ObservableObject, IDisposable
{
    public void Dispose()
    {
        _responseCts?.Cancel();
        _responseCts?.Dispose();
        GC.SuppressFinalize(this);
    }

    // AIDEV-NOTE: invalidate transcript ownership before cancellation can resume a pending continuation.
    public void Reset()
    {
        _generation++;
        _responseCts?.Cancel();
        _responseCts?.Dispose();
        _responseCts = null;
        _sessionId = null;
        Transcript.Clear();
        Input = "";
        Busy = false;
    }

    public const string ExternalAiNotice =
        "Messages and any mail content you include are sent to an external AI service.";

    public const string PermissionsNotice =
        "Assistant permissions: read, search and draft only. It cannot send mail, delete, or run commands.";

    private readonly AppServices _services;
    private string? _sessionId;
    private int _generation;
    private CancellationTokenSource? _responseCts;

    public AssistantViewModel(AppServices services)
    {
        _services = services;
        RefreshAvailability();
    }

    public ObservableCollection<TranscriptLine> Transcript { get; } = new();

    public string[] Runtimes { get; } = { "Codex", "Claude" };

    [ObservableProperty] private string _selectedRuntime = "Codex";
    [ObservableProperty] private string? _unavailableReason;
    [ObservableProperty] private string _input = "";
    [ObservableProperty] private bool _busy;
    [ObservableProperty] private bool _isAvailable;

    partial void OnSelectedRuntimeChanged(string value)
    {
        // AIDEV-NOTE: a session belongs to one provider; switching must invalidate even late stream output.
        Reset();
        RefreshAvailability();
    }

    private void RefreshAvailability()
    {
        var runtime = SelectedRuntime == "Claude" ? AgentRuntime.Claude : AgentRuntime.Codex;
        var unavailable = _services.AgentsBridge.CheckAvailability(runtime);
        UnavailableReason = unavailable?.Reason;
        IsAvailable = unavailable is null;
    }

    [RelayCommand]
    private async Task SendAsync()
    {
        var text = Input.Trim();
        if (text.Length == 0 || !IsAvailable || Busy)
        {
            return;
        }

        var runtime = SelectedRuntime == "Claude" ? AgentRuntime.Claude : AgentRuntime.Codex;
        Busy = true;
        Input = "";
        Transcript.Add(new TranscriptLine("You", text));
        _responseCts = new CancellationTokenSource();
        var generation = _generation;
        var ct = _responseCts.Token;
        try
        {
            var sessionId = _sessionId ?? await _services.AgentsBridge.StartSessionAsync(runtime, ct);
            if (generation != _generation) return;
            _sessionId = sessionId;
            await foreach (var evt in _services.AgentsBridge.SendAsync(sessionId, text, ct))
            {
                if (generation != _generation) return;
                switch (evt.Kind)
                {
                    case AgentEventKind.Output:
                        Transcript.Add(new TranscriptLine(runtime.ToString(), evt.Text));
                        break;
                    case AgentEventKind.Error:
                        Transcript.Add(new TranscriptLine("System", "Assistant error: " + evt.Text));
                        break;
                    case AgentEventKind.Completed:
                        break;
                }
            }
        }
        catch (OperationCanceledException)
        {
            if (generation == _generation) Transcript.Add(new TranscriptLine("System", "Response cancelled."));
        }
        catch (InvalidOperationException ex)
        {
            if (generation == _generation)
            {
                Transcript.Add(new TranscriptLine("System", ex.Message));
                RefreshAvailability();
            }
        }
        finally
        {
            if (generation == _generation) Busy = false;
        }
    }

    [RelayCommand]
    private async Task CancelAsync()
    {
        _responseCts?.Cancel();
        if (_sessionId is not null)
        {
            await _services.AgentsBridge.CancelAsync(_sessionId);
        }
    }
}
