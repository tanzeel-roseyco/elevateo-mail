import SwiftUI
import ElevateoCore

// AIDEV-NOTE: top-level signed-in screen; owns the navigation stack for mailboxes → threads → thread.

struct MailboxListView: View {
    @Environment(AppModel.self) private var model
    @State private var state: LoadState<[Mailbox]> = .idle

    var body: some View {
        NavigationStack {
            Group {
                switch state {
                case .idle, .loading:
                    ProgressView("Loading mailboxes…")
                        .accessibilityLabel("Loading mailboxes")
                case .failed(let message):
                    ErrorRetryView(message: message) {
                        Task { await load() }
                    }
                case .loaded(let mailboxes) where mailboxes.isEmpty:
                    EmptyStateView(
                        title: "No mailboxes",
                        detail: "You do not have access to any mailbox in this organization."
                    )
                case .loaded(let mailboxes):
                    List(mailboxes) { mailbox in
                        NavigationLink(value: mailbox) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(mailbox.displayName)
                                    .font(.headline)
                                if let address = mailbox.displayAddress {
                                    Text(address)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .refreshable { await load() }
                }
            }
            .safeAreaInset(edge: .top) {
                if model.offline { OfflineBanner() }
            }
            .navigationTitle("Mailboxes")
            .navigationDestination(for: Mailbox.self) { mailbox in
                ThreadListView(mailbox: mailbox)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign Out") {
                        Task { await model.signOut() }
                    }
                    .accessibilityHint("Signs out and clears stored credentials")
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        guard let context = model.context else {
            await model.sessionExpired()
            return
        }
        if case .loaded = state {} else { state = .loading }
        do {
            // AIDEV-NOTE: follows next_cursor so more than one page (50) of mailboxes still lists fully.
            var all: [Mailbox] = []
            var cursor: String? = nil
            repeat {
                let page = try await model.client.listMailboxes(context: context, cursor: cursor)
                all.append(contentsOf: page.items)
                cursor = page.nextCursor
            } while cursor != nil
            model.markOffline(false)
            state = .loaded(all)
        } catch APIClientError.sessionExpired {
            await model.sessionExpired()
        } catch APIClientError.network {
            model.markOffline(true)
            state = .failed(message: "Could not reach the server. Check your connection and try again.")
        } catch {
            state = .failed(message: "Mailboxes could not be loaded.")
        }
    }
}
