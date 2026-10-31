import SwiftUI
import ElevateoCore

// AIDEV-NOTE: conversation list for one mailbox; keyset pagination via next_cursor, pull-to-refresh resets.

struct ThreadListView: View {
    let mailbox: Mailbox

    @Environment(AppModel.self) private var model
    /// First-page load state; continuation pages live in `pager` (ElevateoCore, unit-tested).
    @State private var state: LoadState<Void> = .idle
    @State private var pager = CursorPager<ThreadSummary>()

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
            case .loaded where pager.items.isEmpty:
                EmptyStateView(
                    title: "No conversations",
                    detail: "This mailbox has no conversations in the inbox."
                )
            case .loaded:
                List {
                    ForEach(pager.items) { thread in
                        NavigationLink(value: thread) {
                            ThreadRow(thread: thread)
                        }
                    }
                    if let error = pager.paginationError {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(CorporateTheme.danger)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                    if pager.hasMore {
                        HStack {
                            Spacer()
                            if pager.loadingMore {
                                ProgressView().accessibilityLabel("Loading more conversations")
                            } else {
                                Button(pager.paginationError == nil ? "Load more" : "Try again") {
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
        // A refresh makes any outstanding "load more" stale, so its late page cannot overwrite this one.
        let generation = pager.beginRefresh()
        do {
            let page = try await model.client.listThreads(mailboxID: mailbox.id, context: context)
            guard pager.applyFirstPage(page.items, nextCursor: page.nextCursor, generation: generation) else { return }
            model.markOffline(false)
            state = .loaded(())
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
        guard let context = model.context else {
            await model.sessionExpired()
            return
        }
        guard let request = pager.beginLoadMore() else { return }
        do {
            let page = try await model.client.listThreads(mailboxID: mailbox.id, context: context, cursor: request.cursor)
            pager.applyMore(page.items, nextCursor: page.nextCursor, generation: request.generation)
            model.markOffline(false)
        } catch APIClientError.sessionExpired {
            await model.sessionExpired()
        } catch APIClientError.network {
            model.markOffline(true)
            pager.failMore("More conversations could not be loaded. Check your connection and try again.", generation: request.generation)
        } catch {
            pager.failMore("More conversations could not be loaded.", generation: request.generation)
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
                        .foregroundStyle(CorporateTheme.muted)
                }
                if thread.starred {
                    Image(systemName: "star.fill")
                        .foregroundStyle(CorporateTheme.warning)
                        .accessibilityLabel("Starred")
                }
            }
            Text(thread.subject ?? "(no subject)")
                .font(.body)
                .lineLimit(1)
            // preview_text is plain text from the server; rendered as text only.
            Text(thread.previewText)
                .font(.caption)
                .foregroundStyle(CorporateTheme.muted)
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
