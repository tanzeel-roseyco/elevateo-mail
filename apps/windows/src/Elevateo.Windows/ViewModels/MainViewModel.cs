using System;
using System.Collections.ObjectModel;
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
    private CancellationTokenSource? _threadLoadCts;

    public void Dispose() => _threadLoadCts?.Dispose();

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

    [RelayCommand]
    private async Task SignInAsync(CancellationToken ct)
    {
        SignInBusy = true;
        SignInError = null;
        try
        {
            var result = await _services.Authenticator.SignInAsync(ct);
            if (result.Success is null)
            {
                SignInError = result.Failure!.Reason;
                return;
            }

            _services.Session.Establish(result.Success);
            var session = await _services.Api.GetSessionAsync(ct);
            if (!session.IsSuccess)
            {
                _services.Session.SignOut();
                SignInError = session.Error!.Message;
                return;
            }

            AccountLabel = session.Value!.Actor.DisplayName ?? session.Value.Organization.Name;
            IsSignedIn = true;
            await LoadMailboxesAsync(ct);
        }
        catch (OperationCanceledException)
        {
            SignInError = "Sign-in was cancelled.";
        }
        finally
        {
            SignInBusy = false;
        }
    }

    [RelayCommand]
    private void SignOut()
    {
        // DESK-05: erase local tokens; server-side revocation applies to subsequent calls.
        _services.Session.SignOut();
        IsSignedIn = false;
        Mailboxes.Clear();
        Threads.Clear();
        Messages.Clear();
        SelectedMailbox = null;
        SelectedThread = null;
        AccountLabel = "";
    }

    // ---- Mailboxes ----
    public ObservableCollection<Mailbox> Mailboxes { get; } = new();
    [ObservableProperty] private bool _mailboxesLoading;
    [ObservableProperty] private string? _mailboxesError;
    [ObservableProperty] private bool _mailboxesEmpty;
    [ObservableProperty] private Mailbox? _selectedMailbox;

    [RelayCommand]
    private async Task LoadMailboxesAsync(CancellationToken ct)
    {
        MailboxesLoading = true;
        MailboxesError = null;
        MailboxesEmpty = false;
        try
        {
            var result = await _services.Api.ListMailboxesAsync(null, ct);
            if (!result.IsSuccess)
            {
                MailboxesError = result.Error!.Message;
                HandleSessionError(result.Error);
                return;
            }

            Mailboxes.Clear();
            foreach (var mailbox in result.Value!.Items)
            {
                Mailboxes.Add(mailbox);
            }

            MailboxesEmpty = Mailboxes.Count == 0;
            if (!MailboxesEmpty)
            {
                SelectedMailbox = Mailboxes[0];
            }
        }
        finally
        {
            MailboxesLoading = false;
        }
    }

    partial void OnSelectedMailboxChanged(Mailbox? value)
    {
        if (value is not null)
        {
            _ = LoadThreadsCommand.ExecuteAsync(null);
        }
    }

    // ---- Threads ----
    public ObservableCollection<ThreadRow> Threads { get; } = new();
    [ObservableProperty] private bool _threadsLoading;
    [ObservableProperty] private string? _threadsError;
    [ObservableProperty] private bool _threadsEmpty;
    [ObservableProperty] private ThreadRow? _selectedThread;

    [RelayCommand]
    private async Task LoadThreadsAsync(CancellationToken ct)
    {
        var mailbox = SelectedMailbox;
        if (mailbox is null)
        {
            return;
        }

        ThreadsLoading = true;
        ThreadsError = null;
        ThreadsEmpty = false;
        try
        {
            var result = await _services.Api.ListThreadsAsync(mailbox.Id, null, ct);
            if (!result.IsSuccess)
            {
                ThreadsError = result.Error!.Message;
                HandleSessionError(result.Error);
                return;
            }

            Threads.Clear();
            foreach (var t in result.Value!.Items)
            {
                Threads.Add(new ThreadRow(
                    t.Id,
                    t.Subject ?? "(no subject)",
                    t.Sender?.DisplayName ?? t.Sender?.AddressValue ?? "(unknown sender)",
                    t.PreviewText,
                    t.Unread,
                    t.LastMessageAt ?? ""));
            }

            ThreadsEmpty = Threads.Count == 0;
        }
        finally
        {
            ThreadsLoading = false;
        }
    }

    partial void OnSelectedThreadChanged(ThreadRow? value)
    {
        if (value is not null)
        {
            _ = LoadThreadDetailAsync(value);
        }
    }

    // ---- Thread view (plain text only) ----
    public ObservableCollection<MessageRow> Messages { get; } = new();
    [ObservableProperty] private bool _threadLoading;
    [ObservableProperty] private string? _threadError;
    [ObservableProperty] private string _threadSubject = "";

    private async Task LoadThreadDetailAsync(ThreadRow row)
    {
        var mailbox = SelectedMailbox;
        if (mailbox is null)
        {
            return;
        }

        // Cancel a previous in-flight detail load when the user moves selection quickly.
        _threadLoadCts?.Cancel();
        _threadLoadCts = new CancellationTokenSource();
        var ct = _threadLoadCts.Token;

        ThreadLoading = true;
        ThreadError = null;
        Messages.Clear();
        ThreadSubject = row.Subject;
        ResetComposer(row);
        try
        {
            var result = await _services.Api.GetThreadAsync(row.Id, mailbox.Id, null, ct);
            if (ct.IsCancellationRequested)
            {
                return;
            }

            if (!result.IsSuccess)
            {
                ThreadError = result.Error!.Message;
                HandleSessionError(result.Error);
                return;
            }

            foreach (var m in result.Value!.Messages)
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

    private void ResetComposer(ThreadRow row)
    {
        ComposerBody = "";
        ComposerStatus = "";
        _composerDraftId = null;
        _composerVersion = 0;
        _composerThreadId = row.Id;
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

        ComposerBusy = true;
        ComposerStatus = "Saving draft…";
        try
        {
            // expected_version=0 creates; operation_id makes retries idempotent on the server ledger.
            _composerDraftId ??= Guid.NewGuid().ToString();
            var input = new DraftSaveInput
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
            if (!result.IsSuccess)
            {
                ComposerStatus = result.Error!.Message;
                HandleSessionError(result.Error);
                return;
            }

            _composerVersion = result.Value!.Version;
            ComposerStatus = "Draft saved (v" + _composerVersion
                + "). Review and approve sending in the Elevateo web app.";
        }
        finally
        {
            ComposerBusy = false;
        }
    }

    private void HandleSessionError(ApiError error)
    {
        if (error.Kind == ApiErrorKind.SessionExpired)
        {
            SignOut();
            SignInError = "Your session has expired. Sign in again.";
        }
    }
}
