import SwiftUI
import ElevateoCore

// AIDEV-NOTE: message bodies render as plain text ONLY (Text view). Never HTML, never WKWebView,
// links are not tappable/auto-loaded — email content is untrusted input (docs/desktop-and-connectors.md §5).

struct ThreadDetailView: View {
    let mailbox: Mailbox
    let threadSummary: ThreadSummary

    @Environment(AppModel.self) private var model
    @State private var state: LoadState<ThreadDetailPage> = .idle
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
            case .loaded(let page) where page.messages.isEmpty:
                // Empty conversations are valid per the contract.
                EmptyStateView(
                    title: "No messages",
                    detail: "This conversation has no messages yet."
                )
            case .loaded(let page):
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        Text(page.thread.subject ?? "(no subject)")
                            .font(.title3.bold())
                            .accessibilityAddTraits(.isHeader)
                        ForEach(page.messages) { message in
                            MessageView(message: message)
                        }
                        if page.nextCursor != nil {
                            Text("Older messages are not shown. Pull to refresh for the latest.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
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
        do {
            let page = try await model.client.getThread(
                threadID: threadSummary.id,
                mailboxID: mailbox.id,
                context: context
            )
            model.markOffline(false)
            state = .loaded(page)
        } catch APIClientError.sessionExpired {
            await model.sessionExpired()
        } catch APIClientError.network {
            model.markOffline(true)
            state = .failed(message: "Could not load this conversation. Check your connection and try again.")
        } catch {
            state = .failed(message: "This conversation could not be loaded.")
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
                        .foregroundStyle(.secondary)
                }
            }
            if !message.to.isEmpty {
                Text("To: \(message.to.map { $0.displayName ?? $0.address ?? "unknown" }.joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            // Plain Text view: no HTML, no link detection, no remote content.
            Text(verbatim: message.bodyText)
                .font(.body)
                .textSelection(.enabled)
            if message.bodyTruncated {
                Text("Message truncated by the server.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if message.attachmentCount > 0 {
                Label("\(message.attachmentCount) attachment(s) — view in the web app", systemImage: "paperclip")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
    }
}
