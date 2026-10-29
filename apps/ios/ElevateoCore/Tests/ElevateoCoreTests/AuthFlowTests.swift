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
}
