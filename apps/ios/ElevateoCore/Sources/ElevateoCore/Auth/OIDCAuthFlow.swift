import Foundation

// AIDEV-NOTE: OIDC code+PKCE front half (authorize URL + callback validation). The code-for-token
// exchange has no server contract yet; see TokenExchangePort. State is single-use: a replayed
// callback after success is rejected even with a matching state.

public enum AuthFlowError: Error, Sendable, Equatable {
    case stateMismatch
    case replayed
    case expired
    case providerError(code: String)
    case missingAuthorizationCode
    case noPendingAuthorization
    case randomSourceFailure
    case invalidConfiguration(String)
}

public struct OIDCConfiguration: Sendable, Equatable {
    public let authorizationEndpoint: URL
    public let clientID: String
    public let redirectURI: URL
    public let scopes: [String]

    public init(authorizationEndpoint: URL, clientID: String, redirectURI: URL, scopes: [String] = ["openid", "profile", "email"]) {
        self.authorizationEndpoint = authorizationEndpoint
        self.clientID = clientID
        self.redirectURI = redirectURI
        self.scopes = scopes
    }
}

public struct PendingAuthorization: Sendable, Equatable {
    public let state: String
    public let pkce: PKCEPair
    public let authorizationURL: URL
    public let expiresAt: Date
}

public struct AuthorizedCode: Sendable, Equatable {
    public let code: String
    public let pkceVerifier: String
}

/// Serializes the single pending login attempt. Starting a new attempt burns any older one,
/// so a late callback from a previous login can never be adopted (availability tradeoff,
/// per apps/native/auth-contract-proposal.md).
public actor OIDCAuthFlow {
    private let configuration: OIDCConfiguration
    private let lifetime: TimeInterval
    private var pending: PendingAuthorization?

    public init(configuration: OIDCConfiguration, lifetime: TimeInterval = 600) {
        self.configuration = configuration
        self.lifetime = lifetime
    }

    public func begin(
        now: Date = Date(),
        randomBytes: @Sendable (Int) -> [UInt8] = PKCEPair.systemRandomBytes
    ) throws -> PendingAuthorization {
        let pkce = try PKCEPair.generate(randomBytes: randomBytes)
        let stateBytes = randomBytes(32)
        guard stateBytes.count == 32 else { throw AuthFlowError.randomSourceFailure }
        let state = PKCEPair.base64URL(Data(stateBytes))

        guard var components = URLComponents(url: configuration.authorizationEndpoint, resolvingAgainstBaseURL: false) else {
            throw AuthFlowError.invalidConfiguration("authorization endpoint is not a valid URL")
        }
        components.queryItems = (components.queryItems ?? []) + [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: configuration.clientID),
            URLQueryItem(name: "redirect_uri", value: configuration.redirectURI.absoluteString),
            URLQueryItem(name: "scope", value: configuration.scopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
            URLQueryItem(name: "code_challenge_method", value: pkce.method),
        ]
        guard let url = components.url else {
            throw AuthFlowError.invalidConfiguration("could not compose authorization URL")
        }

        let attempt = PendingAuthorization(state: state, pkce: pkce, authorizationURL: url, expiresAt: now.addingTimeInterval(lifetime))
        pending = attempt
        return attempt
    }

    /// Validates a redirect callback. Order matters: expiry and state are checked before the
    /// provider error so an attacker-supplied error on a stale callback cannot cancel a live attempt.
    public func handleCallback(_ url: URL, now: Date = Date()) throws -> AuthorizedCode {
        guard let attempt = pending else { throw AuthFlowError.replayed }

        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first(where: { $0.name == name })?.value }

        guard now < attempt.expiresAt else {
            pending = nil
            throw AuthFlowError.expired
        }
        guard let state = value("state"), constantTimeEquals(state, attempt.state) else {
            // Wrong-state callbacks do NOT burn the pending attempt: an unsolicited forged
            // callback must not be able to deny the real one.
            throw AuthFlowError.stateMismatch
        }
        // From here the state matched, so this is our callback; it is consumed either way.
        pending = nil
        if let error = value("error") {
            throw AuthFlowError.providerError(code: error)
        }
        guard let code = value("code"), !code.isEmpty else {
            throw AuthFlowError.missingAuthorizationCode
        }
        return AuthorizedCode(code: code, pkceVerifier: attempt.pkce.verifier)
    }

    public func cancelPending() {
        pending = nil
    }

    // Constant-time comparison so state checking leaks no prefix-length timing signal.
    private func constantTimeEquals(_ a: String, _ b: String) -> Bool {
        let ab = Array(a.utf8), bb = Array(b.utf8)
        guard ab.count == bb.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<ab.count { diff |= ab[i] ^ bb[i] }
        return diff == 0
    }
}
