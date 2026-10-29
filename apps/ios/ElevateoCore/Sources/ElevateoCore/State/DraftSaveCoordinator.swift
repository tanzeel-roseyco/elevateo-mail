import Foundation

// AIDEV-NOTE: owns reply-draft save identity and outcome so the composer view cannot violate the
// v1 operation ledger: one operation id always carries one immutable payload. An unconfirmed save
// (transport failure: the server may have committed) is resolved only by replaying that exact
// payload; later edits get a new operation id based on the confirmed version.

/// The editable part of a reply draft, compared to decide whether the screen is saved.
public struct DraftContent: Sendable, Equatable {
    public var subject: String
    public var to: [Address]
    public var bodyText: String

    public init(subject: String, to: [Address], bodyText: String) {
        self.subject = subject
        self.to = to
        self.bodyText = bodyText
    }
}

public struct DraftSaveCoordinator: Sendable {
    public enum Status: Sendable, Equatable {
        case idle
        case saving
        /// The last save may or may not have committed; the next save replays it unchanged.
        case unconfirmed
        /// Another save advanced the draft; the person must choose how to reconcile.
        case conflict
        case failed(String)
    }

    public let draftID: UUID
    public let mailboxID: UUID
    public let replyToThreadID: UUID?
    public private(set) var confirmedVersion = 0
    /// Content the server acknowledged at `confirmedVersion` (nil before the first save).
    public private(set) var acknowledged: DraftContent?
    /// The in-flight or unconfirmed operation; its payload never changes.
    public private(set) var pending: DraftSaveInput?
    public private(set) var status: Status = .idle

    public init(draftID: UUID = UUID(), mailboxID: UUID, replyToThreadID: UUID?) {
        self.draftID = draftID
        self.mailboxID = mailboxID
        self.replyToThreadID = replyToThreadID
    }

    /// Saved only when the screen shows exactly what the server acknowledged and nothing is pending.
    public func isSaved(_ content: DraftContent) -> Bool {
        pending == nil && acknowledged == content
    }

    /// Whether the next save replays an unconfirmed operation instead of sending current edits.
    public var replaysUnconfirmedSave: Bool { status == .unconfirmed && pending != nil }

    /// The payload for the next save; nil while one is in flight or a conflict is unresolved.
    public mutating func beginSave(_ content: DraftContent, newOperationID: () -> UUID = UUID.init) -> DraftSaveInput? {
        switch status {
        case .saving, .conflict:
            return nil
        case .unconfirmed:
            guard let replay = pending else { break }
            status = .saving
            return replay
        case .idle, .failed:
            break
        }
        let input = DraftSaveInput(
            mailboxID: mailboxID,
            operationID: newOperationID(),
            expectedVersion: confirmedVersion,
            subject: content.subject,
            to: content.to,
            bodyText: content.bodyText,
            replyToThreadID: replyToThreadID
        )
        pending = input
        status = .saving
        return input
    }

    /// The server applied `pending` (or an identical replay of it).
    public mutating func succeed(_ result: DraftSaveResult) {
        guard let input = pending, result.operationID == input.operationID else { return }
        confirmedVersion = result.version
        acknowledged = DraftContent(subject: input.subject, to: input.to, bodyText: input.bodyText)
        pending = nil
        status = .idle
    }

    /// Maps a failed save to the next state. Transport failures stay unconfirmed (never "not saved").
    public mutating func fail(_ error: APIClientError) {
        switch error {
        case .network, .cancelled:
            status = .unconfirmed
        case .draftConflict:
            pending = nil
            status = .conflict
        case .server(_, let payload):
            pending = nil
            status = .failed("The server rejected the draft (\(payload.code.rawValue)). Request ID \(payload.requestID).")
        case .sessionExpired:
            status = .failed("Your session expired. Sign in again to save this draft.")
        case .invalidResponse, .responseTooLarge, .redirectRejected, .responseMismatch:
            // The server's reply could not be trusted, so the outcome is unknown: replay it.
            status = .unconfirmed
        }
    }

    /// Conflict reconciliation: adopt the server's current draft as the confirmed base. The view
    /// then either keeps the person's edits (next save overwrites) or loads the server content.
    public mutating func adoptServerDraft(_ draft: Draft) {
        guard draft.id == draftID else { return }
        confirmedVersion = draft.version
        acknowledged = DraftContent(subject: draft.subject, to: draft.to, bodyText: draft.bodyText)
        pending = nil
        status = .idle
    }
}
