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

    // Regression (P10-1): recipients with null fields still send both keys as explicit JSON null.
    func testNullRecipientFieldsAreEncodedAsExplicitNull() throws {
        let data = try JSONEncoder().encode([Address(displayName: nil, address: "ana@example.com"), Address(displayName: nil, address: nil)])
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        for recipient in json {
            XCTAssertEqual(Set(recipient.keys), ["display_name", "address"])
            XCTAssertTrue(recipient["display_name"] is NSNull)
        }
        XCTAssertTrue(json[1]["address"] is NSNull)
    }

    // Regression (P10-2): a schema-valid but contract-invalid save result is not a success.
    func testContractInvalidSaveResultIsRejected() async throws {
        let invalid = Fixtures.draftSaveResultJSON
            .replacingOccurrences(of: "\"version\": 1", with: "\"version\": -1")
            .replacingOccurrences(of: "\"editable\"", with: "\"failed\"")
        let transport = MockTransport([ScriptedResponse(status: 200, json: invalid)])
        do {
            _ = try await makeClient(transport).saveDraft(draftID: draftID, input: input(), context: try Fixtures.context())
            XCTFail("expected invalidResponse")
        } catch let error as APIClientError {
            guard case .invalidResponse = error else { return XCTFail("unexpected \(error)") }
        }
    }

    // Regression (P08-3): a save result for another operation is not this save's outcome.
    func testSaveResultForAnotherOperationIsRejected() async throws {
        let other = Fixtures.draftSaveResultJSON.replacingOccurrences(of: "66666666-6666-6666-6666-666666666666", with: "77777777-7777-7777-7777-777777777777")
        let transport = MockTransport([ScriptedResponse(status: 200, json: other)])
        do {
            _ = try await makeClient(transport).saveDraft(draftID: draftID, input: input(), context: try Fixtures.context())
            XCTFail("expected responseMismatch")
        } catch let error as APIClientError {
            guard case .responseMismatch = error else { return XCTFail("unexpected \(error)") }
        }
    }

    private func coordinator() -> DraftSaveCoordinator {
        DraftSaveCoordinator(draftID: draftID, mailboxID: input().mailboxID, replyToThreadID: input().replyToThreadID)
    }

    private func result(_ input: DraftSaveInput, version: Int) throws -> DraftSaveResult {
        try JSONDecoder().decode(DraftSaveResult.self, from: Data("""
        {"draft_id": "\(draftID.uuidString.lowercased())", "operation_id": "\(input.operationID.uuidString.lowercased())", "version": \(version), "state": "editable"}
        """.utf8))
    }

    private let first = DraftContent(subject: "Re: Welcome", to: [], bodyText: "One")

    // P05: consecutive saves use fresh operation ids based on the confirmed version.
    func testConsecutiveSavesAdvanceVersionWithNewOperations() throws {
        var saves = coordinator()
        let a = try XCTUnwrap(saves.beginSave(first))
        XCTAssertEqual(a.expectedVersion, 0)
        saves.succeed(try result(a, version: 1))
        XCTAssertTrue(saves.isSaved(first))
        var second = first
        second.bodyText = "Two"
        let b = try XCTUnwrap(saves.beginSave(second))
        XCTAssertNotEqual(a.operationID, b.operationID)
        XCTAssertEqual(b.expectedVersion, 1)
    }

    // Regression (P05-1, P05-3): a lost response is unconfirmed (never "not saved") and is resolved
    // by replaying the identical payload, even after intervening edits, which follow it later.
    func testLostResponseReplaysTheSamePayloadDespiteEdits() throws {
        var saves = coordinator()
        let original = try XCTUnwrap(saves.beginSave(first))
        saves.fail(.network(underlying: URLError(.timedOut)))
        XCTAssertEqual(saves.status, .unconfirmed)
        XCTAssertTrue(saves.replaysUnconfirmedSave)
        var edited = first
        edited.bodyText = "Edited while offline"
        let replay = try XCTUnwrap(saves.beginSave(edited))
        XCTAssertEqual(replay, original, "same operation id must carry the same payload")
        saves.succeed(try result(replay, version: 1))
        XCTAssertFalse(saves.isSaved(edited), "edits after the replay are not saved yet")
        let next = try XCTUnwrap(saves.beginSave(edited))
        XCTAssertNotEqual(next.operationID, original.operationID)
        XCTAssertEqual(next.bodyText, "Edited while offline")
        XCTAssertEqual(next.expectedVersion, 1)
    }

    // Regression (P05-2): a conflict blocks saving until the server draft is adopted.
    func testConflictRequiresReconciliationBeforeSaving() throws {
        var saves = coordinator()
        _ = try XCTUnwrap(saves.beginSave(first))
        saves.fail(.draftConflict(try JSONDecoder().decode(ErrorPayload.self, from: Data(Fixtures.draftConflictJSON.utf8))))
        XCTAssertEqual(saves.status, .conflict)
        XCTAssertNil(saves.beginSave(first), "saving again would only repeat the recorded conflict")
        let server = try JSONDecoder().decode(Draft.self, from: Data("""
        {"id": "\(draftID.uuidString.lowercased())", "mailbox_id": "33333333-3333-3333-3333-333333333333", "subject": "Theirs",
         "to": [], "body_text": "Server", "reply_to_thread_id": null, "version": 4, "state": "editable",
         "created_at": "2026-10-20T10:00:00Z", "updated_at": "2026-10-20T10:05:00Z"}
        """.utf8))
        saves.adoptServerDraft(server)
        XCTAssertEqual(saves.status, .idle)
        XCTAssertEqual(try XCTUnwrap(saves.beginSave(first)).expectedVersion, 4)
    }

    // Regression (P05-4): the saved indicator disappears as soon as the fields differ.
    func testSavedIndicatorTracksTheAcknowledgedContent() throws {
        var saves = coordinator()
        let a = try XCTUnwrap(saves.beginSave(first))
        var typedDuringSave = first
        typedDuringSave.subject = "Changed mid-request"
        saves.succeed(try result(a, version: 1))
        XCTAssertTrue(saves.isSaved(first))
        XCTAssertFalse(saves.isSaved(typedDuringSave))
    }
}
