import Foundation

// AIDEV-NOTE: session restore and sign-out policy for the iOS app, extracted from AppModel so it is
// unit-tested on Linux. Sign-out revokes the server cookie session (POST /v1/auth/logout), always
// clears this app's cookies and stored credentials, and fences any restore that was in flight so
// a late GET /v1/session cannot sign the person back in.

/// The two server calls the lifecycle needs; ElevateoAPIClient conforms.
public protocol SessionAPI: Sendable {
    func getSession() async throws -> Session
    func logout(context: SessionContext) async throws -> AuthLogout
}

extension ElevateoAPIClient: SessionAPI {}

/// Local cookie storage for the API origin (HTTPCookieStorage in the app, a fake in tests).
public protocol SessionCookieJar: Sendable {
    func removeCookies(for url: URL)
}

public enum RestoreOutcome: Sendable, Equatable {
    case signedIn(Session)
    case signedOut
    case offline
    case failed
    /// A sign-out happened while this restore was running; its result was discarded.
    case superseded
}

public enum SignOutOutcome: Sendable, Equatable {
    /// Server revoked the session and the identity provider sign-out completed.
    case complete
    /// Server revoked the session; identity-provider sign-out is still pending server-side.
    case upstreamPending
    /// The server could not confirm revocation (offline, error). Local state is cleared anyway.
    case serverUnconfirmed
    /// Local credentials could not be removed from secure storage.
    case localStorageFailed(String)
}

public actor SessionLifecycle {
    private let api: any SessionAPI
    private let tokenStore: any TokenStore
    private let cookieJar: any SessionCookieJar
    private let apiBaseURL: URL
    private var signOutGeneration = 0
    public private(set) var context: SessionContext?

    public init(api: any SessionAPI, tokenStore: any TokenStore, cookieJar: any SessionCookieJar, apiBaseURL: URL) {
        self.api = api
        self.tokenStore = tokenStore
        self.cookieJar = cookieJar
        self.apiBaseURL = apiBaseURL
    }

    public func restore() async -> RestoreOutcome {
        let generation = signOutGeneration
        let outcome: RestoreOutcome
        do {
            let session = try await api.getSession()
            outcome = .signedIn(session)
        } catch APIClientError.sessionExpired {
            _ = await clearLocalState()
            outcome = .signedOut
        } catch APIClientError.network {
            outcome = .offline
        } catch {
            outcome = .failed
        }
        // The actor is re-entrant across the await: a sign-out may have run meanwhile.
        guard generation == signOutGeneration else { return .superseded }
        if case .signedIn(let session) = outcome { context = SessionContext(session: session) }
        return outcome
    }

    public func signOut() async -> SignOutOutcome {
        signOutGeneration += 1
        let current = context
        context = nil
        var outcome = SignOutOutcome.serverUnconfirmed
        if let current {
            do {
                let result = try await api.logout(context: current)
                outcome = result.upstreamStatus == "complete" ? .complete : .upstreamPending
            } catch APIClientError.sessionExpired {
                // The server no longer knows this session: nothing left to revoke there.
                outcome = .complete
            } catch {
                outcome = .serverUnconfirmed
            }
        }
        // Local cleanup runs whatever the server said, so this device is signed out regardless.
        if let failure = await clearLocalState() { return .localStorageFailed(failure) }
        return outcome
    }

    /// Clears context, cookies and stored credentials; returns a description when storage failed.
    public func clearLocalState() async -> String? {
        context = nil
        cookieJar.removeCookies(for: apiBaseURL)
        do {
            try await tokenStore.clear()
            return nil
        } catch {
            return String(describing: error)
        }
    }
}

/// Validated app configuration (Info.plist values in the app; plain strings in tests).
public struct ClientSettings: Sendable, Equatable {
    public let apiBaseURL: URL
    public let authorizationEndpoint: URL
    public let clientID: String
    public let redirectURI: URL

    public enum Invalid: Error, Sendable, Equatable {
        case setting(String)
    }

    /// API and authorization endpoints must be HTTPS with a host; the redirect must use the URL
    /// scheme the app registers (`callbackScheme`) and have a host, or the callback never arrives.
    public init(apiBaseURL: String?, authorizationEndpoint: String?, clientID: String?, redirectURI: String?, callbackScheme: String) throws {
        func https(_ raw: String?, _ name: String) throws -> URL {
            guard let raw, let url = URL(string: raw), OIDCConfiguration.isAcceptableEndpoint(url) else {
                throw Invalid.setting(name)
            }
            return url
        }
        self.apiBaseURL = try https(apiBaseURL, "ElevateoAPIBaseURL")
        self.authorizationEndpoint = try https(authorizationEndpoint, "ElevateoSSOAuthorizationEndpoint")
        let trimmedClient = clientID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        // An unexpanded build setting such as "$(ELEVATEO_SSO_CLIENT_ID)" is a build defect, not an id.
        guard !trimmedClient.isEmpty, !trimmedClient.contains("$("), trimmedClient.count <= 256 else {
            throw Invalid.setting("ElevateoSSOClientID")
        }
        self.clientID = trimmedClient
        guard let raw = redirectURI, let redirect = URL(string: raw),
              redirect.scheme?.lowercased() == callbackScheme.lowercased(),
              !(redirect.host ?? "").isEmpty
        else { throw Invalid.setting("ElevateoSSORedirectURI") }
        self.redirectURI = redirect
    }
}
