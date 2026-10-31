import SwiftUI
import ElevateoCore

// AIDEV-NOTE: message bodies render as plain text ONLY (Text view). Never HTML, never WKWebView,
// links are not tappable/auto-loaded — email content is untrusted input (docs/desktop-and-connectors.md §5).

struct ThreadDetailView: View {
    let mailbox: Mailbox
    let threadSummary: ThreadSummary

    @Environment(AppModel.self) private var model
    /// Thread metadata from the first page; messages (in contract order, oldest first) and the
    /// continuation cursor live in `pager` (ElevateoCore, unit-tested).
    @State private var state: LoadState<ThreadDetail> = .idle
    @State private var pager = CursorPager<Message>()
    @State private var showComposer = false

    var body: some View {
        Group {
            switch state {
            case .idle, .loading:
                ProgressView("Loading conversation…")
                    .accessibilityLabel("Loading conversation")
            case .failed(let message):
                ErrorRetryView(message: message) {
                    Task { await load() }
                }
            case .loaded where pager.items.isEmpty:
                // Empty conversations are valid per the contract.
                EmptyStateView(
                    title: "No messages",
                    detail: "This conversation has no messages yet."
                )
            case .loaded(let thread):
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        Text(thread.subject ?? "(no subject)")
                            .font(.title3.bold())
                            .accessibilityAddTraits(.isHeader)
                        ForEach(pager.items) { message in
                            MessageView(message: message)
                        }
                        // Contract order is oldest first, so the continuation holds NEWER messages.
                        if let error = pager.paginationError {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(CorporateTheme.danger)
                                .accessibilityAddTraits(.updatesFrequently)
                        }
                        if pager.hasMore {
                            if pager.loadingMore {
                                ProgressView().accessibilityLabel("Loading newer messages")
                            } else {
                                Button(pager.paginationError == nil ? "Show newer messages" : "Try again") {
                                    Task { await loadMore() }
                                }
                            }
                        }
                    }
                    .padding()
                }
                .refreshable { await load() }
            }
        }
        .safeAreaInset(edge: .top) {
            if model.offline { OfflineBanner() }
        }
        .navigationTitle("Conversation")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showComposer = true
                } label: {
                    Label("Reply", systemImage: "arrowshape.turn.up.left")
                }
                .disabled(!mailbox.capabilities.compose || !isLoaded)
                .accessibilityHint(
                    mailbox.capabilities.compose
                        ? "Opens the reply draft composer"
                        : "You do not have compose permission in this mailbox"
                )
            }
        }
        .sheet(isPresented: $showComposer) {
            ReplyComposerView(
                mailbox: mailbox,
                threadID: threadSummary.id,
                defaultSubject: replySubject,
                defaultRecipient: threadSummary.sender
            )
        }
        .task { await load() }
    }

    private var isLoaded: Bool {
        if case .loaded = state { return true }
        return false
    }

    private var replySubject: String {
        let subject = threadSummary.subject ?? ""
        return subject.lowercased().hasPrefix("re:") ? subject : "Re: \(subject)"
    }

    private func load() async {
        guard let context = model.context else {
            await model.sessionExpired()
            return
        }
        if !isLoaded { state = .loading }
        // Refresh restarts from the first page and invalidates any in-flight continuation.
        let generation = pager.beginRefresh()
        do {
            let page = try await model.client.getThread(
                threadID: threadSummary.id,
                mailboxID: mailbox.id,
                context: context
            )
            guard pager.applyFirstPage(page.messages, nextCursor: page.nextCursor, generation: generation) else { return }
            model.markOffline(false)
            state = .loaded(page.thread)
        } catch APIClientError.sessionExpired {
            await model.sessionExpired()
        } catch APIClientError.network {
            model.markOffline(true)
            state = .failed(message: "Could not load this conversation. Check your connection and try again.")
        } catch {
            state = .failed(message: "This conversation could not be loaded.")
        }
    }

    private func loadMore() async {
        guard let context = model.context else {
            await model.sessionExpired()
            return
        }
        guard let request = pager.beginLoadMore() else { return }
        do {
            let page = try await model.client.getThread(
                threadID: threadSummary.id,
                mailboxID: mailbox.id,
                context: context,
                cursor: request.cursor
            )
            pager.applyMore(page.messages, nextCursor: page.nextCursor, generation: request.generation)
            model.markOffline(false)
        } catch APIClientError.sessionExpired {
            await model.sessionExpired()
        } catch APIClientError.network {
            model.markOffline(true)
            pager.failMore("Newer messages could not be loaded. Check your connection and try again.", generation: request.generation)
        } catch {
            pager.failMore("Newer messages could not be loaded.", generation: request.generation)
        }
    }
}

struct MessageView: View {
    let message: Message

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(message.sender?.displayName ?? message.sender?.address ?? "Unknown sender")
                    .font(.subheadline.bold())
                Spacer()
                if let at = message.sentAt {
                    Text(at.date, format: .dateTime.day().month().hour().minute())
                        .font(.caption)
                        .foregroundStyle(CorporateTheme.muted)
                }
            }
            if !message.to.isEmpty {
                Text("To: \(message.to.map { $0.displayName ?? $0.address ?? "unknown" }.joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(CorporateTheme.muted)
            }
            // Plain Text view: no HTML, no link detection, no remote content.
            Text(verbatim: message.bodyText)
                .font(.body)
                .textSelection(.enabled)
            if message.bodyTruncated {
                Text("Message truncated by the server.")
                    .font(.caption2)
                    .foregroundStyle(CorporateTheme.muted)
            }
            if message.attachmentCount > 0 {
                Label("\(message.attachmentCount) attachment(s) — view in the web app", systemImage: "paperclip")
                    .font(.caption)
                    .foregroundStyle(CorporateTheme.muted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CorporateTheme.neutral, in: RoundedRectangle(cornerRadius: 4))
        .accessibilityElement(children: .combine)
    }
}
