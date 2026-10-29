import XCTest
@testable import ElevateoCore

final class DraftTests: XCTestCase {
    private func input() -> DraftSaveInput {
        DraftSaveInput(
            mailboxID: UUID(uuidString: "33333333-3333-3333-3333-333333333333")!,
            operationID: UUID(uuidString: "66666666-6666-6666-6666-666666666666")!,
            expectedVersion: 0,
            subject: "Re: Welcome",
            to: [Address(displayName: "Ana", address: "ana@example.com")],
            bodyText: "Thanks!",
            replyToThreadID: UUID(uuidString: "44444444-4444-4444-4444-444444444444")
        )
    }

    private let draftID = UUID(uuidString: "55555555-5555-5555-5555-555555555555")!

    // Happy path: create (expected_version 0) returns version 1 and sends CSRF + Origin + null-capable body.
    func testCreateReplyDraftSucceeds() async throws {
        let transport = MockTransport([ScriptedResponse(status: 200, json: Fixtures.draftSaveResultJSON)])
        let client = makeClient(transport)

        let result = try await client.saveDraft(draftID: draftID, input: input(), context: try Fixtures.context())

        XCTAssertEqual(result.version, 1)
        XCTAssertEqual(result.state, "editable")

        let request = transport.requests[0]
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), Fixtures.csrfToken)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://mail.company.example")
        let body = try XCTUnwrap(request.httpBody)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["expected_version"] as? Int, 0)
        // reply_to_thread_id must be present even if null; here it carries the thread.
        XCTAssertEqual(json["reply_to_thread_id"] as? String, "44444444-4444-4444-4444-444444444444")
    }

    // Failure path 1: 409 draft_conflict becomes the typed draftConflict error with the server envelope.
    func testVersionConflictMapsToTypedConflict() async throws {
        let transport = MockTransport([ScriptedResponse(status: 409, json: Fixtures.draftConflictJSON)])
        let client = makeClient(transport)

        do {
            _ = try await client.saveDraft(draftID: draftID, input: input(), context: try Fixtures.context())
            XCTFail("expected draftConflict")
        } catch let error as APIClientError {
            guard case .draftConflict(let payload) = error else {
                return XCTFail("unexpected error \(error)")
            }
            XCTAssertEqual(payload.code, .draftConflict)
            XCTAssertEqual(payload.requestID, "req-2")
        }
    }

    // Failure path 2: transport failure is surfaced as a network error, never a fake success.
    func testNetworkFailureIsSurfaced() async throws {
        let transport = MockTransport([ScriptedResponse(failure: .notConnectedToInternet)])
        let client = makeClient(transport)

        do {
            _ = try await client.saveDraft(draftID: draftID, input: input(), context: try Fixtures.context())
            XCTFail("expected network error")
        } catch let error as APIClientError {
            guard case .network(let underlying) = error else {
                return XCTFail("unexpected error \(error)")
            }
            XCTAssertEqual((underlying as? URLError)?.code, .notConnectedToInternet)
        }
    }
}
