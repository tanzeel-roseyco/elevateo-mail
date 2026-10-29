import Foundation

// AIDEV-NOTE: DTOs mirror contracts/v1/openapi.json exactly; validation beyond Codable lives in validating types below.

/// Opaque bootstrap/CSRF token. The contract constrains it to 16...256 URL-safe characters;
/// we enforce that at the decode boundary so a tampered payload fails as a typed error.
public struct OpaqueToken: Sendable, Equatable, Codable {
    public let rawValue: String

    public init(validating raw: String) throws {
        guard (16...256).contains(raw.count),
              raw.allSatisfy({ $0.isLetter && $0.isASCII || $0.isNumber && $0.isASCII || $0 == "_" || $0 == "-" })
        else { throw ModelValidationError.invalidOpaqueToken }
        self.rawValue = raw
    }

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        try self.init(validating: raw)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }
}

/// UTC timestamp; contract requires an ISO-8601 date-time ending in "Z".
public struct UTCTimestamp: Sendable, Equatable, Codable {
    public let rawValue: String
    public let date: Date

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard raw.hasSuffix("Z"), let parsed = UTCTimestamp.parser.date(from: raw) ?? UTCTimestamp.fractionalParser.date(from: raw) else {
            throw ModelValidationError.invalidTimestamp(raw)
        }
        self.rawValue = raw
        self.date = parsed
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }

    // AIDEV-NOTE: two parsers because the server may emit fractional seconds; ISO8601DateFormatter cannot do both at once.
    private static let parser: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let fractionalParser: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

public enum ModelValidationError: Error, Sendable, Equatable {
    case invalidOpaqueToken
    case invalidTimestamp(String)
}

public struct Address: Sendable, Equatable, Codable {
    public let displayName: String?
    public let address: String?

    public init(displayName: String?, address: String?) {
        self.displayName = displayName
        self.address = address
    }

    enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
        case address
    }
}

public struct Capabilities: Sendable, Equatable, Codable {
    public let read: Bool
    public let compose: Bool
    public let approveSend: Bool
    public let manageMembers: Bool

    enum CodingKeys: String, CodingKey {
        case read, compose
        case approveSend = "approve_send"
        case manageMembers = "manage_members"
    }
}

public struct Mailbox: Sendable, Equatable, Codable, Identifiable {
    public let id: UUID
    public let displayName: String
    public let displayAddress: String?
    public let capabilities: Capabilities

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case displayAddress = "display_address"
        case capabilities
    }
}

public struct Session: Sendable, Equatable, Codable {
    public struct Actor: Sendable, Equatable, Codable {
        public let id: UUID
        public let displayName: String?
        enum CodingKeys: String, CodingKey {
            case id
            case displayName = "display_name"
        }
    }
    public struct Organization: Sendable, Equatable, Codable {
        public let id: UUID
        public let name: String
    }

    public let contextID: OpaqueToken
    public let authorizationVersion: OpaqueToken
    public let actor: Actor
    public let organization: Organization
    public let simulationMode: Bool
    public let csrfToken: OpaqueToken

    enum CodingKeys: String, CodingKey {
        case contextID = "context_id"
        case authorizationVersion = "authorization_version"
        case actor, organization
        case simulationMode = "simulation_mode"
        case csrfToken = "csrf_token"
    }
}

public struct MailboxPage: Sendable, Equatable, Codable {
    public let contextID: OpaqueToken
    public let authorizationVersion: OpaqueToken
    public let nextCursor: String?
    public let items: [Mailbox]

    enum CodingKeys: String, CodingKey {
        case contextID = "context_id"
        case authorizationVersion = "authorization_version"
        case nextCursor = "next_cursor"
        case items
    }
}

public enum ThreadFolder: String, Sendable, Codable {
    case inbox, archive, spam, trash
}

public struct ThreadSummary: Sendable, Equatable, Codable, Identifiable {
    public let id: UUID
    public let mailboxID: UUID
    public let subject: String?
    public let subjectTruncated: Bool
    public let sender: Address?
    public let previewText: String
    public let lastMessageAt: UTCTimestamp?
    public let unread: Bool
    public let messageCount: Int
    public let folder: ThreadFolder
    public let snoozedUntil: UTCTimestamp?
    public let starred: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case mailboxID = "mailbox_id"
        case subject
        case subjectTruncated = "subject_truncated"
        case sender
        case previewText = "preview_text"
        case lastMessageAt = "last_message_at"
        case unread
        case messageCount = "message_count"
        case folder
        case snoozedUntil = "snoozed_until"
        case starred
    }
}

public struct ThreadPage: Sendable, Equatable, Codable {
    public let contextID: OpaqueToken
    public let authorizationVersion: OpaqueToken
    public let nextCursor: String?
    public let mailboxID: UUID
    public let items: [ThreadSummary]

    enum CodingKeys: String, CodingKey {
        case contextID = "context_id"
        case authorizationVersion = "authorization_version"
        case nextCursor = "next_cursor"
        case mailboxID = "mailbox_id"
        case items
    }
}

public struct ThreadDetail: Sendable, Equatable, Codable {
    public let id: UUID
    public let mailboxID: UUID
    public let subject: String?
    public let subjectTruncated: Bool
    public let unread: Bool
    public let messageCount: Int
    public let folder: ThreadFolder
    public let snoozedUntil: UTCTimestamp?
    public let starred: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case mailboxID = "mailbox_id"
        case subject
        case subjectTruncated = "subject_truncated"
        case unread
        case messageCount = "message_count"
        case folder
        case snoozedUntil = "snoozed_until"
        case starred
    }
}

/// Mail message. `bodyText` is plain text by contract and must only ever be rendered as text.
public struct Message: Sendable, Equatable, Codable, Identifiable {
    public let id: UUID
    public let sender: Address?
    public let to: [Address]
    public let sentAt: UTCTimestamp?
    public let bodyText: String
    public let bodyTruncated: Bool
    public let attachmentCount: Int

    enum CodingKeys: String, CodingKey {
        case id, sender, to
        case sentAt = "sent_at"
        case bodyText = "body_text"
        case bodyTruncated = "body_truncated"
        case attachmentCount = "attachment_count"
    }
}

public struct ThreadDetailPage: Sendable, Equatable, Codable {
    public let contextID: OpaqueToken
    public let authorizationVersion: OpaqueToken
    public let nextCursor: String?
    public let thread: ThreadDetail
    public let messages: [Message]

    enum CodingKeys: String, CodingKey {
        case contextID = "context_id"
        case authorizationVersion = "authorization_version"
        case nextCursor = "next_cursor"
        case thread, messages
    }
}

/// Complete-replacement draft save body (PUT /v1/drafts/{id}); expected_version 0 creates version 1.
public struct DraftSaveInput: Sendable, Equatable, Codable {
    public let mailboxID: UUID
    public let operationID: UUID
    public let expectedVersion: Int
    public let subject: String
    public let to: [Address]
    public let bodyText: String
    public let replyToThreadID: UUID?

    public init(mailboxID: UUID, operationID: UUID, expectedVersion: Int, subject: String, to: [Address], bodyText: String, replyToThreadID: UUID?) {
        self.mailboxID = mailboxID
        self.operationID = operationID
        self.expectedVersion = expectedVersion
        self.subject = subject
        self.to = to
        self.bodyText = bodyText
        self.replyToThreadID = replyToThreadID
    }

    enum CodingKeys: String, CodingKey {
        case mailboxID = "mailbox_id"
        case operationID = "operation_id"
        case expectedVersion = "expected_version"
        case subject, to
        case bodyText = "body_text"
        case replyToThreadID = "reply_to_thread_id"
    }

    // AIDEV-NOTE: contract requires reply_to_thread_id present even when null; synthesized encoding would drop it.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(mailboxID, forKey: .mailboxID)
        try c.encode(operationID, forKey: .operationID)
        try c.encode(expectedVersion, forKey: .expectedVersion)
        try c.encode(subject, forKey: .subject)
        try c.encode(to, forKey: .to)
        try c.encode(bodyText, forKey: .bodyText)
        try c.encode(replyToThreadID, forKey: .replyToThreadID)
    }
}

public struct DraftSaveResult: Sendable, Equatable, Codable {
    public let draftID: UUID
    public let operationID: UUID
    public let version: Int
    public let state: String

    enum CodingKeys: String, CodingKey {
        case draftID = "draft_id"
        case operationID = "operation_id"
        case version, state
    }
}

public struct Draft: Sendable, Equatable, Codable, Identifiable {
    public let id: UUID
    public let mailboxID: UUID
    public let subject: String
    public let to: [Address]
    public let bodyText: String
    public let replyToThreadID: UUID?
    public let version: Int
    public let state: String
    public let createdAt: UTCTimestamp
    public let updatedAt: UTCTimestamp

    enum CodingKeys: String, CodingKey {
        case id
        case mailboxID = "mailbox_id"
        case subject, to
        case bodyText = "body_text"
        case replyToThreadID = "reply_to_thread_id"
        case version, state
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

public struct DraftResponse: Sendable, Equatable, Codable {
    public let contextID: OpaqueToken
    public let authorizationVersion: OpaqueToken
    public let draft: Draft

    enum CodingKeys: String, CodingKey {
        case contextID = "context_id"
        case authorizationVersion = "authorization_version"
        case draft
    }
}

/// Server error envelope, shared by the base routes and the collaboration (C/D) routes.
public struct ErrorPayload: Sendable, Equatable, Codable {
    public enum Code: String, Sendable, Codable {
        case unauthenticated
        case notAvailable = "not_available"
        case contextChanged = "context_changed"
        case cursorInvalid = "cursor_invalid"
        case requestInvalid = "request_invalid"
        case rateLimited = "rate_limited"
        case temporarilyUnavailable = "temporarily_unavailable"
        case internalError = "internal_error"
        case draftConflict = "draft_conflict"
        case operationMismatch = "operation_mismatch"
        case draftConsumed = "draft_consumed"
        case assignmentConflict = "assignment_conflict"
        case membershipConflict = "membership_conflict"
    }

    public let code: Code
    public let message: String
    public let requestID: String

    enum CodingKeys: String, CodingKey {
        case code, message
        case requestID = "request_id"
    }
}
