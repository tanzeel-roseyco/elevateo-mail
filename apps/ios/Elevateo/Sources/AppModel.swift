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
    /// Restore/sign-out policy (tested in ElevateoCore): server logout, cookie and credential
    /// cleanup, and fencing of a restore that races a sign-out.
    let lifecycle: SessionLifecycle
    private(set) var context: SessionContext?

    init() {
        #if canImport(Security)
        let tokenStore: any TokenStore = KeychainTokenStore()
        #else
        let tokenStore: any TokenStore = InMemoryTokenStore()
        #endif
        self.tokenStore = tokenStore
        self.tokenExchange = UnavailableTokenExchange()
        let baseURL: URL
        var configurationNotice: String?
        do {
            let config = try AppConfig.load()
            baseURL = config.apiBaseURL
            self.authFlow = OIDCAuthFlow(configuration: OIDCConfiguration(
                authorizationEndpoint: config.authorizationEndpoint,
                clientID: config.clientID,
                redirectURI: config.redirectURI
            ))
        } catch {
            // Fail loud: a broken Info.plist is a build defect. The placeholder host keeps the
            // app renderable in previews; every call against it fails visibly as a network error.
            assertionFailure("Invalid app configuration: \(error)")
            baseURL = URL(string: "https://invalid.configuration.local")!
            self.authFlow = OIDCAuthFlow(configuration: OIDCConfiguration(
                authorizationEndpoint: baseURL, clientID: "invalid", redirectURI: baseURL
            ))
            configurationNotice = "App configuration is invalid; contact support."
        }
        let client = ElevateoAPIClient(baseURL: baseURL)
        self.client = client
        self.lifecycle = SessionLifecycle(
            api: client, tokenStore: tokenStore, cookieJar: SharedCookieJar(), apiBaseURL: baseURL
        )
        // Assigned last: a class may not touch `self` before every stored property is set.
        self.signInNotice = configurationNotice
    }

    /// Checks for an existing server session (cookie) at launch.
    func restoreSession() async {
        if case .signedIn = phase { return }
        phase = .loadingSession
        switch await lifecycle.restore() {
        case .signedIn(let session):
            adopt(session)
        case .signedOut:
            context = nil
            phase = .signedOut
        case .offline:
            offline = true
            phase = .signedOut
            signInNotice = "You appear to be offline. Connect and try again."
        case .failed:
            phase = .signedOut
            signInNotice = "Could not check your session. Try again."
        case .superseded:
            // A sign-out ran while this check was in flight; never adopt its result.
            break
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
        context = nil
        phase = .signedOut
        switch await lifecycle.signOut() {
        case .complete:
            signInNotice = nil
        case .upstreamPending:
            signInNotice = "Signed out. The sign-in provider is still finishing its sign-out."
        case .serverUnconfirmed:
            signInNotice = "Signed out on this device, but the server could not confirm it. Sign out again when online to end the session everywhere."
        case .localStorageFailed(let detail):
            signInNotice = "Signed out, but stored credentials could not be removed: \(detail)"
        }
    }

    func sessionExpired() async {
        context = nil
        if let failure = await lifecycle.clearLocalState() {
            signInNotice = "Your session expired, and stored credentials could not be removed: \(failure)"
        } else {
            signInNotice = "Your session expired. Sign in again."
        }
        phase = .signedOut
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
        case .unexpectedCallbackDestination: "Sign-in returned to an unexpected address. Try again."
        }
    }
}

/// Removes this app's cookies for the API origin (the cookie session) from shared storage.
struct SharedCookieJar: SessionCookieJar {
    func removeCookies(for url: URL) {
        let storage = HTTPCookieStorage.shared
        storage.cookies(for: url)?.forEach(storage.deleteCookie)
    }
}
