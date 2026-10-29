import XCTest
@testable import ElevateoCore

final class AuthFlowTests: XCTestCase {
    private let fixedBytes: @Sendable (Int) -> [UInt8] = { count in
        Array(repeating: UInt8(7), count: count)
    }

    private func makeFlow(lifetime: TimeInterval = 600) -> OIDCAuthFlow {
        let config = OIDCConfiguration(
            authorizationEndpoint: URL(string: "https://sso.example/application/o/authorize/")!,
            clientID: "elevateo-ios",
            redirectURI: URL(string: "elevateo://auth/callback")!
        )
        return OIDCAuthFlow(configuration: config, lifetime: lifetime)
    }

    private func callback(state: String, code: String? = "abc123", error: String? = nil) -> URL {
        var components = URLComponents(string: "elevateo://auth/callback")!
        var items = [URLQueryItem(name: "state", value: state)]
        if let code { items.append(URLQueryItem(name: "code", value: code)) }
        if let error { items.append(URLQueryItem(name: "error", value: error)) }
        components.queryItems = items
        return components.url!
    }

    // Happy path: begin produces an S256-bound URL and a matching callback yields code + verifier.
    func testValidCallbackReturnsCodeBoundToVerifier() async throws {
        let flow = makeFlow()
        let pending = try await flow.begin(now: Date(timeIntervalSince1970: 0), randomBytes: fixedBytes)

        let query = URLComponents(url: pending.authorizationURL, resolvingAgainstBaseURL: false)!.queryItems!
        func q(_ n: String) -> String? { query.first { $0.name == n }?.value }
        XCTAssertEqual(q("response_type"), "code")
        XCTAssertEqual(q("code_challenge_method"), "S256")
        XCTAssertEqual(q("code_challenge"), PKCEPair.challenge(forVerifier: pending.pkce.verifier))
        XCTAssertEqual(q("state"), pending.state)

        let authorized = try await flow.handleCallback(
            callback(state: pending.state),
            now: Date(timeIntervalSince1970: 60)
        )
        XCTAssertEqual(authorized.code, "abc123")
        XCTAssertEqual(authorized.pkceVerifier, pending.pkce.verifier)
    }

    // Failure path 1: a callback with a foreign state is rejected and does not burn the attempt.
    func testStateMismatchIsRejectedWithoutBurningPendingAttempt() async throws {
        let flow = makeFlow()
        let pending = try await flow.begin(now: Date(timeIntervalSince1970: 0), randomBytes: fixedBytes)

        do {
            _ = try await flow.handleCallback(callback(state: "attacker-chosen-state"), now: Date(timeIntervalSince1970: 1))
            XCTFail("expected stateMismatch")
        } catch let error as AuthFlowError {
            XCTAssertEqual(error, .stateMismatch)
        }

        // The genuine callback still succeeds afterwards.
        _ = try await flow.handleCallback(callback(state: pending.state), now: Date(timeIntervalSince1970: 2))
    }

    // Failure path 2: replaying the already-consumed callback is rejected.
    func testReplayedCallbackIsRejected() async throws {
        let flow = makeFlow()
        let pending = try await flow.begin(now: Date(timeIntervalSince1970: 0), randomBytes: fixedBytes)
        _ = try await flow.handleCallback(callback(state: pending.state), now: Date(timeIntervalSince1970: 1))

        do {
            _ = try await flow.handleCallback(callback(state: pending.state), now: Date(timeIntervalSince1970: 2))
            XCTFail("expected replayed")
        } catch let error as AuthFlowError {
            XCTAssertEqual(error, .replayed)
        }
    }

    // Expiry guard: a callback after the attempt lifetime is rejected and the attempt is cleared.
    func testExpiredCallbackIsRejected() async throws {
        let flow = makeFlow(lifetime: 600)
        let pending = try await flow.begin(now: Date(timeIntervalSince1970: 0), randomBytes: fixedBytes)

        do {
            _ = try await flow.handleCallback(callback(state: pending.state), now: Date(timeIntervalSince1970: 601))
            XCTFail("expected expired")
        } catch let error as AuthFlowError {
            XCTAssertEqual(error, .expired)
        }
    }

    // apps/shared/auth-conformance-vectors.json, shared with the Mac (Rust) and Windows (C#) suites.
    // ELEVATEO_AUTH_VECTORS points at it when only apps/ios is mounted (Docker runs).
    private func sharedVectors() throws -> [String: Any] {
        let path = ProcessInfo.processInfo.environment["ELEVATEO_AUTH_VECTORS"]
            ?? URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("shared/auth-conformance-vectors.json").path
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testConformsToSharedAuthVectors() throws {
        let vectors = try sharedVectors()
        for vector in try XCTUnwrap(vectors["pkce_s256"] as? [[String: Any]]) {
            let verifier = try XCTUnwrap(vector["verifier"] as? String)
            XCTAssertEqual(PKCEPair.challenge(forVerifier: verifier), vector["challenge"] as? String)
        }
        for vector in try XCTUnwrap(vectors["identity_provider_endpoints"] as? [[String: Any]]) {
            let url = try XCTUnwrap(URL(string: try XCTUnwrap(vector["url"] as? String)))
            XCTAssertEqual(OIDCConfiguration.isAcceptableEndpoint(url), vector["accepted"] as? Bool, url.absoluteString)
        }
        let exchange = try XCTUnwrap(vectors["native_session_exchange"] as? [String: Any])
        XCTAssertEqual(exchange["path"] as? String, "/v1/native/sessions")
    }

    // Regression (P09): a cleartext authorization endpoint never receives state or a challenge.
    func testCleartextAuthorizationEndpointIsRejectedBeforeBuildingTheURL() async throws {
        let flow = OIDCAuthFlow(configuration: OIDCConfiguration(
            authorizationEndpoint: URL(string: "http://sso.example/application/o/authorize/")!,
            clientID: "elevateo-ios",
            redirectURI: URL(string: "elevateo://auth/callback")!
        ))
        do {
            _ = try await flow.begin(randomBytes: fixedBytes)
            XCTFail("cleartext endpoint must be rejected")
        } catch let error as AuthFlowError {
            guard case .invalidConfiguration = error else { return XCTFail("unexpected \(error)") }
        }
    }

    // Regression (P09): a matching state at the wrong destination is rejected and the attempt survives.
    func testCallbackToAnotherDestinationIsRejectedWithoutBurningTheAttempt() async throws {
        let flow = makeFlow()
        let pending = try await flow.begin(now: Date(timeIntervalSince1970: 0), randomBytes: fixedBytes)
        var wrong = URLComponents(string: "elevateo://wrong/path")!
        wrong.queryItems = [URLQueryItem(name: "state", value: pending.state), URLQueryItem(name: "code", value: "abc")]
        do {
            _ = try await flow.handleCallback(wrong.url!, now: Date(timeIntervalSince1970: 1))
            XCTFail("wrong destination must be rejected")
        } catch let error as AuthFlowError {
            XCTAssertEqual(error, .unexpectedCallbackDestination)
        }
        let authorized = try await flow.handleCallback(callback(state: pending.state), now: Date(timeIntervalSince1970: 2))
        XCTAssertEqual(authorized.code, "abc123")
    }

    private final class FakeSessionAPI: SessionAPI, @unchecked Sendable {
        private let lock = NSLock()
        var sessionResult: Result<Session, APIClientError>
        var logoutResult: Result<AuthLogout, APIClientError>
        private var logouts = 0
        var logoutCount: Int { lock.withLock { logouts } }
        /// When set, getSession waits for this before answering (to race a sign-out).
        var gate: AsyncStream<Void>?

        init(session: Result<Session, APIClientError>, logout: Result<AuthLogout, APIClientError>) {
            sessionResult = session
            logoutResult = logout
        }

        func getSession() async throws -> Session {
            if let gate { for await _ in gate { break } }
            return try sessionResult.get()
        }

        func logout(context: SessionContext) async throws -> AuthLogout {
            lock.withLock { logouts += 1 }
            return try logoutResult.get()
        }
    }

    private final class FakeCookieJar: SessionCookieJar, @unchecked Sendable {
        private let lock = NSLock()
        private var cleared: [URL] = []
        var clearedURLs: [URL] { lock.withLock { cleared } }
        func removeCookies(for url: URL) { lock.withLock { cleared.append(url) } }
    }

    private struct FailingTokenStore: TokenStore {
        func load() async throws -> TokenSet? { nil }
        func save(_ tokens: TokenSet) async throws {}
        func clear() async throws { throw TokenStoreError.storageUnavailable("keychain locked") }
    }

    private let apiURL = URL(string: "https://mail.company.example")!

    private func completeLogout() throws -> AuthLogout {
        try JSONDecoder().decode(AuthLogout.self, from: Data(#"{"local_revoked": true, "upstream_status": "complete"}"#.utf8))
    }

    // P04: restore adopts a live session; sign-out revokes it server-side and clears local state.
    func testRestoreThenSignOutRevokesAndClearsEverything() async throws {
        let api = FakeSessionAPI(session: .success(try Fixtures.session()), logout: .success(try completeLogout()))
        let jar = FakeCookieJar()
        let tokens = InMemoryTokenStore()
        try await tokens.save(TokenSet(accessToken: "a", refreshToken: "r", expiresAt: Date()))
        let lifecycle = SessionLifecycle(api: api, tokenStore: tokens, cookieJar: jar, apiBaseURL: apiURL)
        guard case .signedIn = await lifecycle.restore() else { return XCTFail("expected signedIn") }
        let outcome = await lifecycle.signOut()
        XCTAssertEqual(outcome, .complete)
        XCTAssertEqual(api.logoutCount, 1)
        XCTAssertEqual(jar.clearedURLs, [apiURL])
        let remaining = try await tokens.load()
        XCTAssertNil(remaining)
        let context = await lifecycle.context
        XCTAssertNil(context)
    }

    // Regression (P04-1): an unreachable server still leaves this device signed out, and says so.
    func testSignOutClearsLocallyWhenTheServerCannotConfirm() async throws {
        let api = FakeSessionAPI(session: .success(try Fixtures.session()), logout: .failure(.network(underlying: URLError(.notConnectedToInternet))))
        let jar = FakeCookieJar()
        let lifecycle = SessionLifecycle(api: api, tokenStore: InMemoryTokenStore(), cookieJar: jar, apiBaseURL: apiURL)
        _ = await lifecycle.restore()
        let outcome = await lifecycle.signOut()
        XCTAssertEqual(outcome, .serverUnconfirmed)
        XCTAssertEqual(jar.clearedURLs, [apiURL])
    }

    // Regression (P04-1): a restore racing a sign-out cannot adopt the old session afterwards.
    func testRestoreSupersededBySignOutIsDiscarded() async throws {
        let api = FakeSessionAPI(session: .success(try Fixtures.session()), logout: .success(try completeLogout()))
        let (gate, open) = AsyncStream<Void>.makeStream()
        api.gate = gate
        let lifecycle = SessionLifecycle(api: api, tokenStore: InMemoryTokenStore(), cookieJar: FakeCookieJar(), apiBaseURL: apiURL)
        let restoring = Task { await lifecycle.restore() }
        try await Task.sleep(nanoseconds: 50_000_000)
        _ = await lifecycle.signOut()
        open.yield()
        let outcome = await restoring.value
        XCTAssertEqual(outcome, .superseded)
        let context = await lifecycle.context
        XCTAssertNil(context)
    }

    // Regression (P04-1): credential storage failure is reported, not hidden behind "signed out".
    func testSignOutReportsCredentialStorageFailure() async throws {
        let api = FakeSessionAPI(session: .failure(.sessionExpired(requestID: nil)), logout: .success(try completeLogout()))
        let lifecycle = SessionLifecycle(api: api, tokenStore: FailingTokenStore(), cookieJar: FakeCookieJar(), apiBaseURL: apiURL)
        let outcome = await lifecycle.signOut()
        guard case .localStorageFailed = outcome else { return XCTFail("unexpected \(outcome)") }
        XCTAssertEqual(api.logoutCount, 0, "no context means nothing to revoke server-side")
    }

    // Regression (P04-2): configuration accepts only usable endpoints and the registered callback scheme.
    func testClientSettingsValidation() throws {
        func make(api: String = "https://mail.company.example", auth: String = "https://sso.company.example/application/o/authorize/",
                  client: String? = "elevateo-ios", redirect: String = "elevateo://auth/callback") throws -> ClientSettings {
            try ClientSettings(apiBaseURL: api, authorizationEndpoint: auth, clientID: client, redirectURI: redirect, callbackScheme: "elevateo")
        }
        XCTAssertNoThrow(try make())
        XCTAssertThrowsError(try make(api: "https:///no-host"))
        XCTAssertThrowsError(try make(auth: "http://sso.company.example/authorize/"))
        XCTAssertThrowsError(try make(redirect: "otherapp://auth/callback"))
        XCTAssertThrowsError(try make(client: "$(ELEVATEO_SSO_CLIENT_ID)"))
        XCTAssertThrowsError(try make(client: "  "))
    }
}
