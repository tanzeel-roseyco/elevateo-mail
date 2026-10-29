import Foundation
import Observation
import ElevateoCore

// AIDEV-NOTE: single owner of session/auth state; views read phase and call intents, never the client directly.

@MainActor
@Observable
final class AppModel {
    enum Phase {
        case signedOut
        case loadingSession
        case signedIn(Session)
    }

    private(set) var phase: Phase = .signedOut
    /// Human-readable sign-in status/problem shown on the sign-in screen (honest states, no fake success).
    private(set) var signInNotice: String?
    private(set) var offline = false

    let client: ElevateoAPIClient
    let authFlow: OIDCAuthFlow
    let tokenStore: any TokenStore
    let tokenExchange: any TokenExchangePort
    private(set) var context: SessionContext?

    init() {
        do {
            let config = try AppConfig.load()
            self.client = ElevateoAPIClient(baseURL: config.apiBaseURL)
            self.authFlow = OIDCAuthFlow(configuration: OIDCConfiguration(
                authorizationEndpoint: config.ssoAuthorizationEndpoint,
                clientID: config.ssoClientID,
                redirectURI: config.ssoRedirectURI
            ))
        } catch {
            // Fail loud: a broken Info.plist is a build defect. The placeholder host keeps the
            // app renderable in previews; every call against it fails visibly as a network error.
            assertionFailure("Invalid app configuration: \(error)")
            let fallback = URL(string: "https://invalid.configuration.local")!
            self.client = ElevateoAPIClient(baseURL: fallback)
            self.authFlow = OIDCAuthFlow(configuration: OIDCConfiguration(
                authorizationEndpoint: fallback, clientID: "invalid", redirectURI: fallback
            ))
            self.signInNotice = "App configuration is invalid; contact support."
        }
        #if canImport(Security)
        self.tokenStore = KeychainTokenStore()
        #else
        self.tokenStore = InMemoryTokenStore()
        #endif
        self.tokenExchange = UnavailableTokenExchange()
    }

    /// Checks for an existing server session (cookie) at launch.
    func restoreSession() async {
        if case .signedIn = phase { return }
        phase = .loadingSession
        do {
            let session = try await client.getSession()
            adopt(session)
        } catch APIClientError.sessionExpired {
            await clearSensitiveState()
            phase = .signedOut
        } catch APIClientError.network {
            offline = true
            phase = .signedOut
            signInNotice = "You appear to be offline. Connect and try again."
        } catch {
            phase = .signedOut
            signInNotice = "Could not check your session. Try again."
        }
    }

    func beginSignIn() async throws -> PendingAuthorization {
        signInNotice = nil
        return try await authFlow.begin()
    }

    /// Completes the ASWebAuthenticationSession callback. The native code-for-session exchange
    /// endpoint is not in contracts/v1 yet, so the stub reports unavailable and we say so.
    func handleSignInCallback(_ url: URL) async {
        do {
            let authorized = try await authFlow.handleCallback(url)
            switch try await tokenExchange.exchange(authorized) {
            case .exchanged(let tokens):
                try await tokenStore.save(tokens)
                await restoreSession()
            case .unavailable(let reason):
                signInNotice = "Signed in with SSO, but native sign-in is not available yet: \(reason)"
            }
        } catch let error as AuthFlowError {
            signInNotice = describe(error)
        } catch {
            signInNotice = "Sign-in failed. Try again."
        }
    }

    func signInFailed(_ message: String) {
        signInNotice = message
    }

    func signOut() async {
        await clearSensitiveState()
        phase = .signedOut
    }

    func sessionExpired() async {
        await clearSensitiveState()
        phase = .signedOut
        signInNotice = "Your session expired. Sign in again."
    }

    func markOffline(_ value: Bool) {
        offline = value
    }

    private func adopt(_ session: Session) {
        context = SessionContext(session: session)
        offline = false
        signInNotice = nil
        phase = .signedIn(session)
    }

    // Contract: on 401 or sign-out, clear sensitive client state (tokens and context).
    private func clearSensitiveState() async {
        context = nil
        do {
            try await tokenStore.clear()
        } catch {
            // Keychain delete failures are visible but must not block sign-out.
            signInNotice = "Signed out, but stored credentials could not be removed: \(error)"
        }
    }

    private func describe(_ error: AuthFlowError) -> String {
        switch error {
        case .stateMismatch: "Sign-in was rejected: the response did not match this attempt."
        case .replayed: "This sign-in response was already used. Start again."
        case .expired: "The sign-in attempt expired. Start again."
        case .providerError(let code): "The identity provider reported an error (\(code))."
        case .missingAuthorizationCode: "The identity provider returned no authorization code."
        case .noPendingAuthorization: "No sign-in is in progress."
        case .randomSourceFailure: "Secure random generation failed; cannot sign in."
        case .invalidConfiguration(let detail): "Sign-in configuration problem: \(detail)"
        }
    }
}
