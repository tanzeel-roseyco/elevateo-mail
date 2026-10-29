import Foundation

// AIDEV-NOTE: protocol so the app target can supply a Keychain store while tests use memory.

public struct TokenSet: Sendable, Equatable, Codable {
    public let accessToken: String
    public let refreshToken: String?
    public let expiresAt: Date

    public init(accessToken: String, refreshToken: String?, expiresAt: Date) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
    }
}

public enum TokenStoreError: Error, Sendable {
    case storageUnavailable(String)
}

public protocol TokenStore: Sendable {
    func load() async throws -> TokenSet?
    func save(_ tokens: TokenSet) async throws
    func clear() async throws
}

/// In-memory store for tests and previews; never persists.
public actor InMemoryTokenStore: TokenStore {
    private var tokens: TokenSet?

    public init() {}

    public func load() async throws -> TokenSet? { tokens }
    public func save(_ tokens: TokenSet) async throws { self.tokens = tokens }
    public func clear() async throws { tokens = nil }
}
