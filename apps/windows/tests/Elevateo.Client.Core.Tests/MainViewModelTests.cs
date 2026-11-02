using Elevateo.Client.Core.Agents;
using Elevateo.Client.Core.Api;
using Elevateo.Client.Core.Auth;
using Elevateo.Windows.Services;
using Elevateo.Windows.ViewModels;
using Xunit;

namespace Elevateo.Client.Core.Tests;

public sealed class MainViewModelTests
{
    [Fact]
    public async Task LostSaveResponseReplaysExactOperationBeforeSavingNewEdits()
    {
        var api = new ViewModelApi();
        using var vm = Create(api);
        vm.SelectedMailbox = Mailbox("a");
        vm.SelectedThread = Row("first");
        vm.ComposerBody = "original";
        DraftSaveInput? original = null;
        api.Save = (_, input) =>
        {
            original = input;
            return Task.FromResult(ApiResult<DraftSaveResult>.Fail(new ApiError(ApiErrorKind.Unavailable, "Offline")));
        };
        await vm.SaveDraftCommand.ExecuteAsync(null);
        Assert.Contains("unconfirmed", vm.ComposerStatus, StringComparison.Ordinal);
        vm.ComposerBody = "new edits";
        api.Save = (id, input) =>
        {
            Assert.Same(original, input);
            return Task.FromResult(ApiResult<DraftSaveResult>.Ok(new DraftSaveResult
            { DraftId = id, OperationId = input.OperationId, Version = 1, State = "editable" }));
        };
        await vm.SaveDraftCommand.ExecuteAsync(null);
        Assert.Contains("latest changes are unsaved", vm.ComposerStatus, StringComparison.Ordinal);
        api.Save = (id, input) =>
        {
            Assert.NotEqual(original!.OperationId, input.OperationId);
            Assert.Equal(1, input.ExpectedVersion);
            Assert.Equal("new edits", input.BodyText);
            return Task.FromResult(ApiResult<DraftSaveResult>.Ok(new DraftSaveResult
            { DraftId = id, OperationId = input.OperationId, Version = 2, State = "editable" }));
        };
        await vm.SaveDraftCommand.ExecuteAsync(null);
        Assert.StartsWith("Draft saved", vm.ComposerStatus, StringComparison.Ordinal);
        vm.ComposerBody = "more edits";
        Assert.Equal("Unsaved changes.", vm.ComposerStatus);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task PendingSaveDoesNotMislabelEditsOrRestoreSignedOutState(bool signOut)
    {
        var api = new ViewModelApi();
        using var vm = Create(api);
        vm.SelectedMailbox = Mailbox("a");
        vm.SelectedThread = Row("first");
        vm.ComposerBody = "original";
        var pending = new TaskCompletionSource<ApiResult<DraftSaveResult>>();
        api.Save = (_, _) => pending.Task;
        var save = vm.SaveDraftCommand.ExecuteAsync(null);
        if (signOut) vm.SignOutCommand.Execute(null);
        else vm.ComposerBody = "changed while saving";
        pending.SetResult(ApiResult<DraftSaveResult>.Ok(new DraftSaveResult
        { DraftId = "first", OperationId = "op", Version = 1, State = "editable" }));
        await save;
        if (signOut)
        {
            Assert.Empty(vm.ComposerBody);
            Assert.Empty(vm.ComposerStatus);
        }
        else Assert.Contains("latest changes are unsaved", vm.ComposerStatus, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task CanceledContinuationClearsLoadingAndAllowsRetry(bool mailboxes)
    {
        var api = new ViewModelApi();
        var mailboxPending = new TaskCompletionSource<ApiResult<MailboxPage>>();
        var threadsPending = new TaskCompletionSource<ApiResult<ThreadPage>>();
        api.Mailboxes = cursor => cursor is null ? Task.FromResult(ApiResult<MailboxPage>.Ok(new MailboxPage
        { ContextId = "c", AuthorizationVersion = "v", Items = [Mailbox("a")], NextCursor = "next" })) : mailboxPending.Task;
        api.Threads = (id, cursor) => cursor is null ? Task.FromResult(ApiResult<ThreadPage>.Ok(Page(id, "first") with
        { NextCursor = "next" })) : threadsPending.Task;
        using var vm = Create(api);
        await vm.LoadMailboxesCommand.ExecuteAsync(null);
        var command = mailboxes ? vm.MoreMailboxesCommand : vm.MoreThreadsCommand;
        var pending = command.ExecuteAsync(null);
        command.Cancel();
        mailboxPending.SetResult(ApiResult<MailboxPage>.Ok(new MailboxPage
        { ContextId = "c", AuthorizationVersion = "v", Items = [Mailbox("b")] }));
        threadsPending.SetResult(ApiResult<ThreadPage>.Ok(Page("a", "second")));
        await pending.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.False(mailboxes ? vm.MailboxesLoading : vm.ThreadsLoading);
        await command.ExecuteAsync(null);
        Assert.Equal(2, mailboxes ? vm.Mailboxes.Count : vm.Threads.Count);
    }

    [Fact]
    public async Task SignOutClearsPrivateStateAndRejectsLateDetail()
    {
        var api = new ViewModelApi();
        var pending = new TaskCompletionSource<ApiResult<ThreadDetailPage>>();
        api.Detail = (_, _) => pending.Task;
        using var vm = Create(api);
        vm.SelectedMailbox = Mailbox("a");
        vm.SelectedThread = Row("a");
        vm.ComposerBody = "private reply";
        vm.Assistant.Input = "private prompt";
        vm.Assistant.Transcript.Add(new TranscriptLine("You", "secret"));
        vm.SignOutCommand.Execute(null);
        pending.SetResult(ApiResult<ThreadDetailPage>.Ok(Detail("a")));
        await Task.Yield();
        Assert.Empty(vm.Messages);
        Assert.Empty(vm.ComposerBody);
        Assert.Empty(vm.ThreadSubject);
        Assert.Empty(vm.Assistant.Input);
        Assert.Empty(vm.Assistant.Transcript);
        Assert.False(vm.ThreadLoading);
    }

    [Fact]
    public async Task MailboxSwitchClearsDependentStateAndRejectsOldList()
    {
        var api = new ViewModelApi();
        var pending = new TaskCompletionSource<ApiResult<ThreadPage>>();
        api.Threads = (id, _) => id == "a" ? pending.Task : Task.FromResult(ApiResult<ThreadPage>.Ok(Page("b")));
        using var vm = Create(api);
        vm.SelectedMailbox = Mailbox("a");
        vm.SelectedThread = Row("old");
        vm.ComposerBody = "private reply";
        vm.SelectedMailbox = Mailbox("b");
        pending.SetResult(ApiResult<ThreadPage>.Ok(Page("a", "old")));
        await Task.Yield();
        Assert.Empty(vm.Threads);
        Assert.Empty(vm.Messages);
        Assert.Empty(vm.ComposerBody);
        Assert.Null(vm.SelectedThread);
        Assert.True(vm.ThreadsEmpty);
    }

    [Fact]
    public async Task EmptyMailboxRefreshClearsPreviousConversation()
    {
        var api = new ViewModelApi();
        using var vm = Create(api);
        vm.SelectedMailbox = Mailbox("a");
        vm.SelectedThread = Row("old");
        vm.ComposerBody = "private reply";
        await vm.LoadMailboxesCommand.ExecuteAsync(null);
        Assert.Null(vm.SelectedMailbox);
        Assert.Null(vm.SelectedThread);
        Assert.Empty(vm.Messages);
        Assert.Empty(vm.ComposerBody);
        Assert.Empty(vm.ThreadSubject);
        Assert.True(vm.MailboxesEmpty);
    }

    [Fact]
    public async Task LateDraftSaveDoesNotOverwriteNewComposerVersion()
    {
        var api = new ViewModelApi();
        var pending = new TaskCompletionSource<ApiResult<DraftSaveResult>>();
        api.Save = (_, _) => pending.Task;
        using var vm = Create(api);
        vm.SelectedMailbox = Mailbox("a");
        vm.SelectedThread = Row("first");
        var save = vm.SaveDraftCommand.ExecuteAsync(null);
        vm.SelectedThread = Row("second");
        pending.SetResult(ApiResult<DraftSaveResult>.Ok(new DraftSaveResult
        { DraftId = "first", OperationId = "op", Version = 1, State = "saved" }));
        await save;
        Assert.Empty(vm.ComposerStatus);
        api.Save = (id, input) =>
        {
            Assert.Equal(0, input.ExpectedVersion);
            Assert.Equal("second", input.ReplyToThreadId);
            return Task.FromResult(ApiResult<DraftSaveResult>.Ok(new DraftSaveResult
            { DraftId = id, OperationId = input.OperationId, Version = 1, State = "saved" }));
        };
        await vm.SaveDraftCommand.ExecuteAsync(null);
        Assert.Contains("Draft saved", vm.ComposerStatus, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ExplicitPaginationUsesAllThreeCursorsAndStopsAtEnd()
    {
        var api = new ViewModelApi();
        api.Mailboxes = cursor => Task.FromResult(ApiResult<MailboxPage>.Ok(new MailboxPage
        { ContextId = "c", AuthorizationVersion = "v", Items = [Mailbox(cursor ?? "a")], NextCursor = cursor is null ? "b" : null }));
        api.Threads = (id, cursor) => Task.FromResult(ApiResult<ThreadPage>.Ok(Page(id, cursor ?? "first") with
        { NextCursor = cursor is null ? "second" : null }));
        api.Detail = (id, cursor) => Task.FromResult(ApiResult<ThreadDetailPage>.Ok(Detail(id) with
        { NextCursor = cursor is null ? "next" : null }));
        using var vm = Create(api);
        await vm.LoadMailboxesCommand.ExecuteAsync(null);
        await vm.MoreMailboxesCommand.ExecuteAsync(null);
        await vm.MoreThreadsCommand.ExecuteAsync(null);
        vm.SelectedThread = vm.Threads[0];
        await vm.MoreMessagesCommand.ExecuteAsync(null);
        Assert.Equal(2, vm.Mailboxes.Count);
        Assert.Equal(2, vm.Threads.Count);
        Assert.Equal(2, vm.Messages.Count);
        Assert.False(vm.HasMoreMailboxes);
        Assert.False(vm.HasMoreThreads);
        Assert.False(vm.HasMoreMessages);
    }

    [Fact]
    public async Task ContextChangeClearsContentAndRequiresFreshSignIn()
    {
        var api = new ViewModelApi { Mailboxes = _ => Task.FromResult(ApiResult<MailboxPage>.Fail(
            new ApiError(ApiErrorKind.ContextChanged, "changed"))) };
        using var vm = Create(api);
        vm.IsSignedIn = true;
        vm.ComposerBody = "private";
        await vm.LoadMailboxesCommand.ExecuteAsync(null);
        Assert.False(vm.IsSignedIn);
        Assert.Empty(vm.ComposerBody);
        Assert.Contains("permissions changed", vm.SignInError, StringComparison.Ordinal);
    }

    [Fact]
    public async Task FailedContinuationPreservesRowsAndCanRetry()
    {
        var api = new ViewModelApi();
        var attempts = 0;
        api.Threads = (id, cursor) => Task.FromResult(cursor is null
            ? ApiResult<ThreadPage>.Ok(Page(id, "first") with { NextCursor = "next" })
            : ++attempts == 1
                ? ApiResult<ThreadPage>.Fail(new ApiError(ApiErrorKind.Unavailable, "Offline"))
                : ApiResult<ThreadPage>.Ok(Page(id, "second")));
        using var vm = Create(api);
        vm.SelectedMailbox = Mailbox("a");
        await vm.MoreThreadsCommand.ExecuteAsync(null);
        Assert.Single(vm.Threads);
        Assert.True(vm.HasMoreThreads);
        Assert.Equal("Offline", vm.ThreadsError);
        await vm.MoreThreadsCommand.ExecuteAsync(null);
        Assert.Equal(2, vm.Threads.Count);
        Assert.False(vm.HasMoreThreads);
        Assert.Null(vm.ThreadsError);
    }

    [Fact]
    public async Task SimulationLabelsDraftActionAndCompletion()
    {
        using var vm = Create(new ViewModelApi());
        vm.SimulationMode = true;
        vm.SelectedMailbox = Mailbox("a");
        vm.SelectedThread = Row("a");
        Assert.Equal("Simulate draft save", vm.SaveDraftLabel);
        await vm.SaveDraftCommand.ExecuteAsync(null);
        Assert.StartsWith("Simulated draft saved", vm.ComposerStatus, StringComparison.Ordinal);
    }

    [Fact]
    public async Task FailedInitialDetailRetriesWithoutChangingSelectionOrDraft()
    {
        var api = new ViewModelApi();
        var attempts = 0;
        api.Detail = (id, _) => Task.FromResult(++attempts == 1
            ? ApiResult<ThreadDetailPage>.Fail(new ApiError(ApiErrorKind.Unavailable, "Offline"))
            : ApiResult<ThreadDetailPage>.Ok(Detail(id)));
        using var vm = Create(api);
        vm.SelectedMailbox = Mailbox("a");
        var selected = Row("a");
        vm.SelectedThread = selected;
        vm.ComposerBody = "Keep my draft";
        Assert.Equal("Offline", vm.ThreadError);
        await vm.RetryMessagesCommand.ExecuteAsync(null);
        Assert.Same(selected, vm.SelectedThread);
        Assert.Single(vm.Messages);
        Assert.Null(vm.ThreadError);
        Assert.Equal("Keep my draft", vm.ComposerBody);
    }

    internal static MainViewModel Create(ViewModelApi api)
    {
        var config = TestConfig.Create();
        return new MainViewModel(new AppServices(config, new AuthSession(new InMemoryTokenStore()), api,
            new LoopbackAuthenticator(config, _ => Task.CompletedTask, new StubHandler(_ => throw new InvalidOperationException("No auth requests expected"))), new UnavailableAgentsBridge()));
    }

    internal static Mailbox Mailbox(string id) => new() { Id = id, DisplayName = id,
        Capabilities = new MailboxCapabilities { Read = true, Compose = true, ApproveSend = false, ManageMembers = false } };
    internal static ThreadRow Row(string id) => new(id, id, "sender", "preview", false, "");
    internal static ThreadPage Page(string mailbox, string? thread = null) => new() { ContextId = "c", AuthorizationVersion = "v",
        MailboxId = mailbox, Items = thread is null ? [] : [new ThreadSummary { Id = thread, MailboxId = mailbox,
        PreviewText = "preview", SubjectTruncated = false, Unread = false, MessageCount = 1, Folder = "inbox", Starred = false }] };
    internal static ThreadDetailPage Detail(string id) => new() { ContextId = "c", AuthorizationVersion = "v",
        Thread = new ThreadDetail { Id = id, MailboxId = "a", SubjectTruncated = false, Unread = false,
            MessageCount = 1, Folder = "inbox", Starred = false }, Messages = [new Message { Id = id, To = [],
                BodyText = "private body", BodyTruncated = false, AttachmentCount = 0 }] };
}

// AIDEV-NOTE: controllable completions deliberately ignore cancellation to exercise stale-result defenses.
public sealed class ViewModelApi : IElevateoApiClient
{
    public Func<CancellationToken, Task<ApiResult<Session>>> Session { get; set; } = _ => throw new NotSupportedException();
    public Func<string?, Task<ApiResult<MailboxPage>>> Mailboxes { get; set; } = _ => Task.FromResult(ApiResult<MailboxPage>.Ok(
        new MailboxPage { ContextId = "c", AuthorizationVersion = "v", Items = [] }));
    public Func<string, string?, Task<ApiResult<ThreadPage>>> Threads { get; set; } = (id, _) =>
        Task.FromResult(ApiResult<ThreadPage>.Ok(MainViewModelTests.Page(id)));
    public Func<string, string?, Task<ApiResult<ThreadDetailPage>>> Detail { get; set; } = (id, _) =>
        Task.FromResult(ApiResult<ThreadDetailPage>.Ok(MainViewModelTests.Detail(id)));
    public Func<string, DraftSaveInput, Task<ApiResult<DraftSaveResult>>> Save { get; set; } = (id, input) =>
        Task.FromResult(ApiResult<DraftSaveResult>.Ok(new DraftSaveResult
        { DraftId = id, OperationId = input.OperationId, Version = 1, State = "saved" }));
    public Task<ApiResult<Session>> GetSessionAsync(CancellationToken ct) => Session(ct);
    public Task<ApiResult<MailboxPage>> ListMailboxesAsync(string? cursor, CancellationToken ct) => Mailboxes(cursor);
    public Task<ApiResult<ThreadPage>> ListThreadsAsync(string mailboxId, string? cursor, CancellationToken ct) => Threads(mailboxId, cursor);
    public Task<ApiResult<ThreadDetailPage>> GetThreadAsync(string threadId, string mailboxId, string? cursor, CancellationToken ct) => Detail(threadId, cursor);
    public Task<ApiResult<DraftSaveResult>> SaveDraftAsync(string draftId, DraftSaveInput input, CancellationToken ct) => Save(draftId, input);
}
