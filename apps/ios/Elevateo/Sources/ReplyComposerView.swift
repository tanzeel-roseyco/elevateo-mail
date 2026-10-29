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
    /// Save identity, versions and outcome (ElevateoCore, unit-tested): one operation id always
    /// carries one payload, and an unconfirmed save is replayed exactly before new edits are sent.
    @State private var saves: DraftSaveCoordinator
    @State private var reconciling = false
    @State private var reconcileError: String?

    init(mailbox: Mailbox, threadID: UUID, defaultSubject: String, defaultRecipient: Address?) {
        self.mailbox = mailbox
        self.threadID = threadID
        self.defaultSubject = defaultSubject
        self.defaultRecipient = defaultRecipient
        _subject = State(initialValue: defaultSubject)
        _recipient = State(initialValue: defaultRecipient?.address ?? "")
        _saves = State(initialValue: DraftSaveCoordinator(mailboxID: mailbox.id, replyToThreadID: threadID))
    }

    /// What the fields show now. Address is nullable by contract; an incomplete unsent recipient is
    /// valid, so no client-side format rejection (the send-review flow validates deliverability).
    private var content: DraftContent {
        let trimmed = recipient.trimmingCharacters(in: .whitespacesAndNewlines)
        let to: [Address] = trimmed.isEmpty ? [] : [Address(displayName: nil, address: trimmed)]
        return DraftContent(subject: subject, to: to, bodyText: bodyText)
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
                .disabled(saves.status == .saving)
                Section("Message") {
                    TextEditor(text: $bodyText)
                        .frame(minHeight: 160)
                        .accessibilityLabel("Message body")
                        .disabled(saves.status == .saving)
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
                statusSection
            }
            .navigationTitle("Reply Draft")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saves.status == .saving {
                        ProgressView().accessibilityLabel("Saving draft")
                    } else {
                        Button(saves.replaysUnconfirmedSave ? "Retry Save" : "Save Draft") {
                            Task { await save() }
                        }
                        .disabled(!mailbox.capabilities.compose || saves.status == .conflict)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        switch saves.status {
        case .unconfirmed:
            Section {
                Text("The last save could not be confirmed: it may or may not have reached the server. Retry Save resends exactly that version; edits made since then are saved after it.")
                    .foregroundStyle(.orange)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        case .conflict:
            Section {
                Text("This draft was changed elsewhere since your last save.")
                    .foregroundStyle(.red)
                Button("Keep my edits (overwrite on next save)") { Task { await reconcile(keepLocal: true) } }
                    .disabled(reconciling)
                Button("Load the saved version (discard my edits)") { Task { await reconcile(keepLocal: false) } }
                    .disabled(reconciling)
                if let reconcileError {
                    Text(reconcileError)
                        .foregroundStyle(.red)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
        case .failed(let message):
            Section {
                Text(message)
                    .foregroundStyle(.red)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        case .idle, .saving:
            if saves.isSaved(content) {
                Section {
                    Label("Draft saved (version \(saves.confirmedVersion)). Finish and send it from the web app.", systemImage: "checkmark.circle")
                        .foregroundStyle(.green)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            } else if saves.acknowledged != nil {
                Section {
                    Label("Unsaved changes", systemImage: "pencil.circle")
                        .foregroundStyle(.secondary)
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
        guard let input = saves.beginSave(content) else { return }
        do {
            let result = try await model.client.saveDraft(draftID: saves.draftID, input: input, context: context)
            saves.succeed(result)
            model.markOffline(false)
        } catch let error as APIClientError {
            saves.fail(error)
            switch error {
            case .sessionExpired:
                await model.sessionExpired()
                dismiss()
            case .network:
                model.markOffline(true)
            default:
                break
            }
        } catch {
            saves.fail(.network(underlying: error))
        }
    }

    /// Conflict reconciliation: fetch the server's current draft, adopt its version, and either
    /// keep the person's edits (the next save overwrites) or replace the fields with it.
    private func reconcile(keepLocal: Bool) async {
        guard let context = model.context else {
            await model.sessionExpired()
            dismiss()
            return
        }
        reconciling = true
        reconcileError = nil
        defer { reconciling = false }
        do {
            let current = try await model.client.getDraft(draftID: saves.draftID, mailboxID: mailbox.id, context: context)
            saves.adoptServerDraft(current.draft)
            if !keepLocal {
                subject = current.draft.subject
                recipient = current.draft.to.first?.address ?? ""
                bodyText = current.draft.bodyText
            }
        } catch APIClientError.sessionExpired {
            await model.sessionExpired()
            dismiss()
        } catch {
            // Stay in the conflict state: nothing was adopted, so saving would conflict again.
            reconcileError = "The saved version could not be loaded. Check your connection and try again."
        }
    }
}
