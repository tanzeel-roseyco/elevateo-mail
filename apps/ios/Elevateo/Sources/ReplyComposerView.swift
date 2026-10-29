import SwiftUI
import ElevateoCore

// AIDEV-NOTE: saves a reply DRAFT only. Sending needs the web review/approval flow; this screen says so
// explicitly and offers no send button. Optimistic versioning: expected_version 0 creates, then tracks.

struct ReplyComposerView: View {
    let mailbox: Mailbox
    let threadID: UUID
    let defaultSubject: String
    let defaultRecipient: Address?

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var subject: String
    @State private var recipient: String
    @State private var bodyText = ""
    @State private var saving = false
    @State private var errorMessage: String?
    @State private var savedVersion: Int?

    // Stable identities across retries: same draft and operation ID so a transport retry
    // cannot create a duplicate draft (server operation ledger converges).
    @State private var draftID = UUID()
    @State private var operationID = UUID()

    init(mailbox: Mailbox, threadID: UUID, defaultSubject: String, defaultRecipient: Address?) {
        self.mailbox = mailbox
        self.threadID = threadID
        self.defaultSubject = defaultSubject
        self.defaultRecipient = defaultRecipient
        _subject = State(initialValue: defaultSubject)
        _recipient = State(initialValue: defaultRecipient?.address ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("To", text: $recipient)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .accessibilityLabel("Recipient email address")
                    TextField("Subject", text: $subject)
                        .accessibilityLabel("Subject")
                }
                Section("Message") {
                    TextEditor(text: $bodyText)
                        .frame(minHeight: 160)
                        .accessibilityLabel("Message body")
                }
                Section {
                    // Honest scope statement: drafts only on iOS.
                    Label(
                        "This saves a draft. Sending requires review and approval in the Elevateo web app.",
                        systemImage: "info.circle"
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
                if let savedVersion {
                    Section {
                        Label("Draft saved (version \(savedVersion)). Finish and send it from the web app.", systemImage: "checkmark.circle")
                            .foregroundStyle(.green)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                }
            }
            .navigationTitle("Reply Draft")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView().accessibilityLabel("Saving draft")
                    } else {
                        Button("Save Draft") {
                            Task { await save() }
                        }
                        .disabled(!mailbox.capabilities.compose)
                    }
                }
            }
        }
    }

    private func save() async {
        guard let context = model.context else {
            await model.sessionExpired()
            dismiss()
            return
        }
        saving = true
        errorMessage = nil
        defer { saving = false }

        // Address is nullable by contract; an incomplete unsent recipient is valid, so no
        // client-side format rejection — the send-review flow validates deliverability.
        let trimmed = recipient.trimmingCharacters(in: .whitespacesAndNewlines)
        let to: [Address] = trimmed.isEmpty ? [] : [Address(displayName: nil, address: trimmed)]
        let input = DraftSaveInput(
            mailboxID: mailbox.id,
            operationID: operationID,
            expectedVersion: savedVersion ?? 0,
            subject: subject,
            to: to,
            bodyText: bodyText,
            replyToThreadID: threadID
        )
        do {
            let result = try await model.client.saveDraft(draftID: draftID, input: input, context: context)
            savedVersion = result.version
            // New operation identity for the NEXT save; the previous one is spent in the ledger.
            operationID = UUID()
            model.markOffline(false)
        } catch APIClientError.draftConflict {
            errorMessage = "This draft changed elsewhere. Reopen it from the web app to continue, or save again to retry from the current version."
        } catch APIClientError.sessionExpired {
            await model.sessionExpired()
            dismiss()
        } catch APIClientError.network {
            model.markOffline(true)
            errorMessage = "Offline — the draft was NOT saved. Reconnect and save again (the retry reuses the same draft, so no duplicate is created)."
        } catch APIClientError.server(_, let payload) {
            errorMessage = "The server rejected the draft (\(payload.code.rawValue)). Request ID \(payload.requestID)."
        } catch {
            errorMessage = "The draft could not be saved."
        }
    }
}
