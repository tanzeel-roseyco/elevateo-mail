import Foundation

// AIDEV-NOTE: contract-request — contracts/v1 has no native OIDC code-for-session exchange.
// Needed: POST /v1/auth/native-exchange { code, pkce_verifier, redirect_uri, client_id } ->
// AuthLifecycle (session + access_expires_at) with code/verifier/redirect/client binding and
// replay rejection, per apps/native/auth-contract-proposal.md. Until it exists this port's
// production implementation reports unavailable and the UI shows an honest state.

public enum TokenExchangeOutcome: Sendable, Equatable {
    case exchanged(TokenSet)
    /// The server contract for a native exchange does not exist yet.
    case unavailable(reason: String)
}

public protocol TokenExchangePort: Sendable {
    func exchange(_ authorized: AuthorizedCode) async throws -> TokenExchangeOutcome
}

/// Honest stub: always reports unavailable. Replace once the contract request above lands.
public struct UnavailableTokenExchange: TokenExchangePort {
    public init() {}

    public func exchange(_ authorized: AuthorizedCode) async throws -> TokenExchangeOutcome {
        .unavailable(reason: "The native sign-in exchange endpoint is not in contracts/v1 yet.")
    }
}
