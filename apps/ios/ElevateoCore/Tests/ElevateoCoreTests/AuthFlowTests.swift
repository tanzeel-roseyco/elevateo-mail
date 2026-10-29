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
}
