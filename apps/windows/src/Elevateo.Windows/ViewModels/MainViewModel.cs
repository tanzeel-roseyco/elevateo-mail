using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Elevateo.Client.Core.Api;
using Elevateo.Windows.Services;

namespace Elevateo.Windows.ViewModels;

/// <summary>Row model for the conversation list.</summary>
public sealed record ThreadRow(string Id, string Subject, string Sender, string Preview, bool Unread, string LastMessageAt);

/// <summary>Row model for the plain-text message view. Body is never interpreted as HTML.</summary>
public sealed record MessageRow(string Sender, string SentAt, string Body, bool Truncated, int AttachmentCount);

/// <summary>
/// Single top-level view model: sign-in, mailboxes, threads, thread view, reply composer, assistant.
/// AIDEV-NOTE: every pane exposes explicit Loading / Error / IsEmpty state; the XAML binds those
/// directly so there is no implicit "blank means loading" state anywhere.
/// </summary>
public partial class MainViewModel : ObservableObject, IDisposable
{
    private readonly AppServices _services;
    private CancellationTokenSource _sessionCts = new();
    private CancellationTokenSource? _mailboxLoadCts;
    private CancellationTokenSource? _threadsLoadCts;
    private CancellationTokenSource? _threadLoadCts;
    private int _composerGeneration;
    private string? _mailboxCursor, _threadsCursor, _messagesCursor;

    // AIDEV-NOTE: cancellation plus identity checks reject even adapters that complete after cancellation.
    private static void CancelLoad(ref CancellationTokenSource? source)
    {
        source?.Cancel();
        source?.Dispose();
        source = null;
    }

    public void Dispose()
    {
        _sessionCts.Cancel();
        _sessionCts.Dispose();
        CancelLoad(ref _mailboxLoadCts);
        CancelLoad(ref _threadsLoadCts);
        CancelLoad(ref _threadLoadCts);
        Assistant.Dispose();
        GC.SuppressFinalize(this);
    }

    public MainViewModel(AppServices services)
    {
        _services = services;
        Assistant = new AssistantViewModel(services);
    }

    public AssistantViewModel Assistant { get; }

    // ---- Sign-in ----
    [ObservableProperty] private bool _isSignedIn;
    [ObservableProperty] private bool _signInBusy;
    [ObservableProperty] private string? _signInError;
    [ObservableProperty] private string _accountLabel = "";
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SaveDraftLabel))]
    private bool _simulationMode;
    public string SaveDraftLabel => SimulationMode ? "Simulate draft save" : "Save draft";
    [ObservableProperty] private bool _hasMoreMailboxes;
    [ObservableProperty] private bool _hasMoreThreads;
    [ObservableProperty] private bool _hasMoreMessages;

    [RelayCommand]
    private async Task SignInAsync(CancellationToken ct)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, _sessionCts.Token);
        ct = linked.Token;
        SignInBusy = true;
        SignInError = null;
        var established = false;
        try
        {
            var result = await _services.Authenticator.SignInAsync(ct);
            if (ct.IsCancellationRequested) return;
            if (result.Success is null)
            {
                SignInError = result.Failure!.Reason;
                return;
            }

            _services.Session.Establish(result.Success);
            established = true;
            var session = await _services.Api.GetSessionAsync(ct);
            ct.ThrowIfCancellationRequested();
            if (!session.IsSuccess)
            {
                _services.Session.SignOut();
                SignInError = session.Error!.Message;
                return;
            }

            SimulationMode = session.Value!.SimulationMode;
            AccountLabel = session.Value.Actor.DisplayName ?? session.Value.Organization.Name;
            IsSignedIn = true;
            await LoadMailboxesAsync(ct);
        }
        catch (OperationCanceledException)
        {
            // AIDEV-NOTE: SignInCommand is non-concurrent; roll back credentials if bootstrap was cancelled.
            if (established) SignOut();
            SignInError = "Sign-in was cancelled." + (SignInError is null ? "" : " " + SignInError);
        }
        catch (Win32Exception)
        {
            SignInError = "Windows Credential Manager could not update your credentials. Sign-in did not complete.";
        }
        finally
        {
            SignInBusy = false;
        }
    }

    [RelayCommand]
    private void SignOut()
    {
        _sessionCts.Cancel();
        _sessionCts.Dispose();
        _sessionCts = new CancellationTokenSource();
        CancelLoad(ref _mailboxLoadCts);
        CancelLoad(ref _threadsLoadCts);
        CancelLoad(ref _threadLoadCts);
        // AIDEV-NOTE: clear private UI state before credential erasure, which can fail independently.
        IsSignedIn = false;
        Mailboxes.Clear();
        SelectedMailbox = null;
        ClearConversation();
        Threads.Clear();
        MailboxesLoading = ThreadsLoading = false;
        MailboxesError = ThreadsError = null;
        MailboxesEmpty = ThreadsEmpty = false;
        _mailboxCursor = _threadsCursor = null;
        HasMoreMailboxes = HasMoreThreads = false;
        AccountLabel = "";
        SimulationMode = false;
        Assistant.Reset();
        SignInError = null;
        try
        {
            _services.Session.SignOut();
        }
        catch (Win32Exception)
        {
            SignInError = "Signed out locally, but Windows Credential Manager could not erase the stored credential.";
        }
    }

    // ---- Mailboxes ----
    public ObservableCollection<Mailbox> Mailboxes { get; } = new();
    [ObservableProperty] private bool _mailboxesLoading;
    [ObservableProperty] private string? _mailboxesError;
    [ObservableProperty] private bool _mailboxesEmpty;
    [ObservableProperty] private Mailbox? _selectedMailbox;

    [RelayCommand]
    private Task LoadMailboxesAsync(CancellationToken ct) => LoadMailboxPageAsync(false, ct);

    [RelayCommand]
    private Task MoreMailboxesAsync(CancellationToken ct) => LoadMailboxPageAsync(true, ct);

    private async Task LoadMailboxPageAsync(bool append, CancellationToken ct)
    {
        if (append && (MailboxesLoading || _mailboxCursor is null)) return;
        CancelLoad(ref _mailboxLoadCts);
        _mailboxLoadCts = CancellationTokenSource.CreateLinkedTokenSource(ct, _sessionCts.Token);
        var owner = _mailboxLoadCts;
        ct = _mailboxLoadCts.Token;
        var cursor = append ? _mailboxCursor : null;
        MailboxesLoading = true;
        MailboxesError = null;
        MailboxesEmpty = false;
        try
        {
            var result = await _services.Api.ListMailboxesAsync(cursor, ct);
            if (ct.IsCancellationRequested) return;
            if (!result.IsSuccess)
            {
                MailboxesError = result.Error!.Message;
                HandleSessionError(result.Error);
                return;
            }

            if (!append)
            {
                // AIDEV-NOTE: an empty refreshed authorization list must also erase the previous mailbox context.
                SelectedMailbox = null;
                Mailboxes.Clear();
            }
            foreach (var mailbox in result.Value!.Items)
            {
                if (!Mailboxes.Any(m => m.Id == mailbox.Id)) Mailboxes.Add(mailbox);
            }

            _mailboxCursor = result.Value.NextCursor == cursor ? null : result.Value.NextCursor;
            HasMoreMailboxes = _mailboxCursor is not null;
            MailboxesEmpty = Mailboxes.Count == 0;
            if (!MailboxesEmpty && !append)
            {
                SelectedMailbox = Mailboxes[0];
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        finally
        {
            // AIDEV-NOTE: command cancellation clears loading; superseded operations cannot clear the new owner's state.
            if (ReferenceEquals(owner, _mailboxLoadCts)) MailboxesLoading = false;
        }
    }

    partial void OnSelectedMailboxChanged(Mailbox? value)
    {
        CancelLoad(ref _threadsLoadCts);
        Threads.Clear();
        ThreadsLoading = false;
        ThreadsError = null;
        ThreadsEmpty = false;
        _threadsCursor = null;
        HasMoreThreads = false;
        ClearConversation();
        if (value is not null) _ = LoadThreadsAsync(CancellationToken.None);
    }

    // ---- Threads ----
    public ObservableCollection<ThreadRow> Threads { get; } = new();
    [ObservableProperty] private bool _threadsLoading;
    [ObservableProperty] private string? _threadsError;
    [ObservableProperty] private bool _threadsEmpty;
    [ObservableProperty] private ThreadRow? _selectedThread;

    [RelayCommand]
    private Task LoadThreadsAsync(CancellationToken ct) => LoadThreadsPageAsync(false, ct);

    [RelayCommand]
    private Task MoreThreadsAsync(CancellationToken ct) => LoadThreadsPageAsync(true, ct);

    private async Task LoadThreadsPageAsync(bool append, CancellationToken ct)
    {
        if (append && (ThreadsLoading || _threadsCursor is null)) return;
        var mailbox = SelectedMailbox;
        if (mailbox is null)
        {
            return;
        }

        CancelLoad(ref _threadsLoadCts);
        _threadsLoadCts = CancellationTokenSource.CreateLinkedTokenSource(ct, _sessionCts.Token);
        var owner = _threadsLoadCts;
        ct = _threadsLoadCts.Token;
        var cursor = append ? _threadsCursor : null;
        ThreadsLoading = true;
        ThreadsError = null;
        ThreadsEmpty = false;
        try
        {
            var result = await _services.Api.ListThreadsAsync(mailbox.Id, cursor, ct);
            if (ct.IsCancellationRequested || SelectedMailbox?.Id != mailbox.Id) return;
            if (!result.IsSuccess)
            {
                ThreadsError = result.Error!.Message;
                HandleSessionError(result.Error);
                return;
            }

            if (!append) Threads.Clear();
            foreach (var t in result.Value!.Items)
            {
                if (Threads.Any(row => row.Id == t.Id)) continue;
                Threads.Add(new ThreadRow(
                    t.Id,
                    t.Subject ?? "(no subject)",
                    t.Sender?.DisplayName ?? t.Sender?.AddressValue ?? "(unknown sender)",
                    t.PreviewText,
                    t.Unread,
                    t.LastMessageAt ?? ""));
            }

            _threadsCursor = result.Value.NextCursor == cursor ? null : result.Value.NextCursor;
            HasMoreThreads = _threadsCursor is not null;
            ThreadsEmpty = Threads.Count == 0;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        finally
        {
            if (ReferenceEquals(owner, _threadsLoadCts)) ThreadsLoading = false;
        }
    }

    partial void OnSelectedThreadChanged(ThreadRow? value)
    {
        ClearConversation(false);
        if (value is not null) _ = LoadThreadDetailAsync(value);
    }

    // ---- Thread view (plain text only) ----
    public ObservableCollection<MessageRow> Messages { get; } = new();
    [ObservableProperty] private bool _threadLoading;
    [ObservableProperty] private string? _threadError;
    [ObservableProperty] private string _threadSubject = "";

    [RelayCommand]
    private Task MoreMessagesAsync() => SelectedThread is { } row && !ThreadLoading && _messagesCursor is not null
        ? LoadThreadDetailAsync(row, true) : Task.CompletedTask;

    // AIDEV-NOTE: retry the failed page without clearing already loaded messages or unsaved composer text.
    [RelayCommand]
    private Task RetryMessagesAsync() => SelectedThread is { } row && !ThreadLoading
        ? LoadThreadDetailAsync(row, true) : Task.CompletedTask;

    private async Task LoadThreadDetailAsync(ThreadRow row, bool append = false)
    {
        var mailbox = SelectedMailbox;
        if (mailbox is null)
        {
            return;
        }

        CancelLoad(ref _threadLoadCts);
        _threadLoadCts = CancellationTokenSource.CreateLinkedTokenSource(_sessionCts.Token);
        var cursor = append ? _messagesCursor : null;
        var ct = _threadLoadCts.Token;

        ThreadLoading = true;
        ThreadError = null;
        if (!append)
        {
            Messages.Clear();
            ThreadSubject = row.Subject;
            ResetComposer(row);
        }
        try
        {
            var result = await _services.Api.GetThreadAsync(row.Id, mailbox.Id, cursor, ct);
            if (ct.IsCancellationRequested || SelectedMailbox?.Id != mailbox.Id || SelectedThread?.Id != row.Id)
            {
                return;
            }

            if (!result.IsSuccess)
            {
                ThreadError = result.Error!.Message;
                HandleSessionError(result.Error);
                return;
            }

            _messagesCursor = result.Value!.NextCursor == cursor ? null : result.Value.NextCursor;
            HasMoreMessages = _messagesCursor is not null;
            foreach (var m in result.Value.Messages)
            {
                Messages.Add(new MessageRow(
                    m.Sender?.DisplayName ?? m.Sender?.AddressValue ?? "(unknown sender)",
                    m.SentAt ?? "",
                    m.BodyText,
                    m.BodyTruncated,
                    m.AttachmentCount));
            }
        }
        catch (OperationCanceledException)
        {
            // superseded by a newer selection; the newer load owns the pane state
        }
        finally
        {
            if (!ct.IsCancellationRequested)
            {
                ThreadLoading = false;
            }
        }
    }

    // ---- Reply composer (draft save only; approval/sending stays in the web review flow) ----
    [ObservableProperty] private string _composerBody = "";
    [ObservableProperty] private string _composerStatus = "";
    [ObservableProperty] private bool _composerBusy;
    private string? _composerDraftId;
    private int _composerVersion;
    private string? _composerThreadId;
    private DraftSaveInput? _pendingSave;

    partial void OnComposerBodyChanged(string value)
    {
        if (!ComposerBusy)
            ComposerStatus = _pendingSave is null ? "Unsaved changes." : "Save unconfirmed. Retry to confirm the earlier content.";
    }

    private void ClearConversation(bool clearSelection = true)
    {
        CancelLoad(ref _threadLoadCts);
        if (clearSelection) SelectedThread = null;
        Messages.Clear();
        ThreadSubject = "";
        ThreadError = null;
        ThreadLoading = false;
        _messagesCursor = null;
        HasMoreMessages = false;
        ResetComposer(null);
    }

    private void ResetComposer(ThreadRow? row)
    {
        _composerGeneration++;
        _pendingSave = null;
        ComposerBody = "";
        ComposerStatus = "";
        ComposerBusy = false;
        _composerDraftId = null;
        _composerVersion = 0;
        _composerThreadId = row?.Id;
    }

    [RelayCommand]
    private async Task SaveDraftAsync(CancellationToken ct)
    {
        var mailbox = SelectedMailbox;
        var threadId = _composerThreadId;
        if (mailbox is null || threadId is null)
        {
            ComposerStatus = "Select a conversation first.";
            return;
        }

        if (!mailbox.Capabilities.Compose)
        {
            ComposerStatus = "You do not have compose permission in this mailbox.";
            return;
        }

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, _sessionCts.Token);
        ct = linked.Token;
        var generation = _composerGeneration;
        ComposerBusy = true;
        ComposerStatus = SimulationMode ? "Simulating draft save..." : "Saving draft...";
        try
        {
            // AIDEV-NOTE: replay an unconfirmed immutable operation; a fresh ID could conflict after a lost response.
            _composerDraftId ??= Guid.NewGuid().ToString();
            var input = _pendingSave ??= new DraftSaveInput
            {
                MailboxId = mailbox.Id,
                OperationId = Guid.NewGuid().ToString(),
                ExpectedVersion = _composerVersion,
                Subject = ThreadSubject,
                To = Array.Empty<Address>(), // reply recipients are resolved in the send-review flow
                BodyText = ComposerBody,
                ReplyToThreadId = threadId,
            };
            var result = await _services.Api.SaveDraftAsync(_composerDraftId, input, ct);
            if (ct.IsCancellationRequested || generation != _composerGeneration) return;
            if (!result.IsSuccess)
            {
                var error = result.Error!;
                if (error.Kind is ApiErrorKind.Unavailable or ApiErrorKind.Server or ApiErrorKind.InvalidResponse)
                    ComposerStatus = "Save unconfirmed. Retry to confirm the earlier content. " + error.Message;
                else
                {
                    _pendingSave = null;
                    ComposerStatus = error.Message;
                }
                HandleSessionError(error);
                return;
            }

            _composerVersion = result.Value!.Version;
            _pendingSave = null;
            ComposerStatus = ComposerBody == input.BodyText
                ? (SimulationMode ? "Simulated draft saved (v" : "Draft saved (v") + _composerVersion
                    + "). Review and approve sending in the Elevateo web app."
                : "Earlier content saved. Your latest changes are unsaved.";
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            if (generation == _composerGeneration)
                ComposerStatus = "Save unconfirmed. Retry to confirm the earlier content.";
        }
        finally
        {
            if (generation == _composerGeneration) ComposerBusy = false;
        }
    }

    private void HandleSessionError(ApiError error)
    {
        if (error.Kind is ApiErrorKind.SessionExpired or ApiErrorKind.ContextChanged)
        {
            SignOut();
            var recovery = error.Kind == ApiErrorKind.ContextChanged
                ? "Your mailbox permissions changed. Sign in again to reload authorized data."
                : "Your session has expired. Sign in again.";
            SignInError = SignInError is null ? recovery : recovery + " " + SignInError;
        }
    }
}
