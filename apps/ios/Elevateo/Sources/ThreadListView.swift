import SwiftUI
import ElevateoCore

// AIDEV-NOTE: conversation list for one mailbox; keyset pagination via next_cursor, pull-to-refresh resets.

struct ThreadListView: View {
    let mailbox: Mailbox

    @Environment(AppModel.self) private var model
    @State private var state: LoadState<[ThreadSummary]> = .idle
    @State private var nextCursor: String?
    @State private var loadingMore = false

    var body: some View {
        Group {
            switch state {
            case .idle, .loading:
                ProgressView("Loading conversations…")
                    .accessibilityLabel("Loading conversations")
            case .failed(let message):
                ErrorRetryView(message: message) {
                    Task { await load(reset: true) }
                }
            case .loaded(let threads) where threads.isEmpty:
                EmptyStateView(
                    title: "No conversations",
                    detail: "This mailbox has no conversations in the inbox."
                )
            case .loaded(let threads):
                List {
                    ForEach(threads) { thread in
                        NavigationLink(value: thread) {
                            ThreadRow(thread: thread)
                        }
                    }
                    if nextCursor != nil {
                        HStack {
                            Spacer()
                            if loadingMore {
                                ProgressView().accessibilityLabel("Loading more conversations")
                            } else {
                                Button("Load more") {
                                    Task { await loadMore() }
                                }
                            }
                            Spacer()
                        }
                    }
                }
                .refreshable { await load(reset: true) }
            }
        }
        .safeAreaInset(edge: .top) {
            if model.offline { OfflineBanner() }
        }
        .navigationTitle(mailbox.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: ThreadSummary.self) { thread in
            ThreadDetailView(mailbox: mailbox, threadSummary: thread)
        }
        .task { await load(reset: false) }
    }

    private func load(reset: Bool) async {
        guard let context = model.context else {
            await model.sessionExpired()
            return
        }
        if reset || isUnloaded { state = .loading }
        do {
            let page = try await model.client.listThreads(mailboxID: mailbox.id, context: context)
            nextCursor = page.nextCursor
            model.markOffline(false)
            state = .loaded(page.items)
        } catch APIClientError.sessionExpired {
            await model.sessionExpired()
        } catch APIClientError.network {
            model.markOffline(true)
            state = .failed(message: "Could not load conversations. Check your connection and try again.")
        } catch {
            state = .failed(message: "Conversations could not be loaded.")
        }
    }

    private func loadMore() async {
        guard let context = model.context, let cursor = nextCursor, case .loaded(let current) = state else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let page = try await model.client.listThreads(mailboxID: mailbox.id, context: context, cursor: cursor)
            nextCursor = page.nextCursor
            // Mutable ordering is not a snapshot across pages; deduplicate by id per contract guidance.
            var seen = Set(current.map(\.id))
            let fresh = page.items.filter { seen.insert($0.id).inserted }
            state = .loaded(current + fresh)
        } catch APIClientError.sessionExpired {
            await model.sessionExpired()
        } catch {
            // Keep the loaded list; the "Load more" row stays available for retry.
        }
    }

    private var isUnloaded: Bool {
        if case .loaded = state { return false }
        return true
    }
}

struct ThreadRow: View {
    let thread: ThreadSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                if thread.unread {
                    Circle()
                        .fill(.blue)
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                }
                Text(thread.sender?.displayName ?? thread.sender?.address ?? "Unknown sender")
                    .font(.subheadline.weight(thread.unread ? .bold : .regular))
                Spacer()
                if let at = thread.lastMessageAt {
                    Text(at.date, style: .date)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if thread.starred {
                    Image(systemName: "star.fill")
                        .foregroundStyle(.yellow)
                        .accessibilityLabel("Starred")
                }
            }
            Text(thread.subject ?? "(no subject)")
                .font(.body)
                .lineLimit(1)
            // preview_text is plain text from the server; rendered as text only.
            Text(thread.previewText)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
    }

    private var accessibilitySummary: String {
        var parts: [String] = []
        if thread.unread { parts.append("Unread") }
        parts.append("From \(thread.sender?.displayName ?? thread.sender?.address ?? "unknown sender")")
        parts.append(thread.subject ?? "no subject")
        parts.append("\(thread.messageCount) messages")
        return parts.joined(separator: ", ")
    }
}
