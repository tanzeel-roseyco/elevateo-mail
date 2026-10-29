import XCTest
@testable import ElevateoCore

final class APIClientTests: XCTestCase {
    // Happy path: a valid thread list decodes and context headers are attached.
    func testListThreadsDecodesValidPage() async throws {
        let transport = MockTransport([ScriptedResponse(status: 200, json: Fixtures.threadPageJSON)])
        let client = makeClient(transport)
        let context = try Fixtures.context()

        let page = try await client.listThreads(
            mailboxID: UUID(uuidString: "33333333-3333-3333-3333-333333333333")!,
            context: context
        )

        XCTAssertEqual(page.items.count, 1)
        XCTAssertEqual(page.items[0].subject, "Welcome")
        XCTAssertEqual(page.items[0].folder, .inbox)
        XCTAssertTrue(page.items[0].unread)
        XCTAssertNil(page.nextCursor)

        let request = transport.requests[0]
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Session-Context"), Fixtures.contextToken)
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Authorization-Version"), Fixtures.authzToken)
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Request-Id"), "test-request-id")
        XCTAssertTrue(request.url!.path.hasSuffix("/threads"))
    }

    // Failure path 1: malformed JSON surfaces as invalidResponse, never a partial object.
    func testMalformedJSONThrowsInvalidResponse() async throws {
        let transport = MockTransport([ScriptedResponse(status: 200, json: "{\"items\": [{\"id\": 42}]")])
        let client = makeClient(transport)

        do {
            _ = try await client.listThreads(
                mailboxID: UUID(uuidString: "33333333-3333-3333-3333-333333333333")!,
                context: try Fixtures.context()
            )
            XCTFail("expected invalidResponse")
        } catch let error as APIClientError {
            guard case .invalidResponse(let status, _) = error else {
                return XCTFail("unexpected error \(error)")
            }
            XCTAssertEqual(status, 200)
        }
    }

    // Failure path 2: 401 maps to the typed sessionExpired error the UI uses to clear state.
    func testUnauthenticatedMapsToSessionExpired() async throws {
        let transport = MockTransport([ScriptedResponse(status: 401, json: Fixtures.errorJSON)])
        let client = makeClient(transport)

        do {
            _ = try await client.listMailboxes(context: try Fixtures.context())
            XCTFail("expected sessionExpired")
        } catch let error as APIClientError {
            guard case .sessionExpired(let requestID) = error else {
                return XCTFail("unexpected error \(error)")
            }
            XCTAssertEqual(requestID, "req-1")
        }
    }
}
