import Foundation
import XCTest
@testable import ElevateoCore
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// AIDEV-NOTE: scripted transport shared by API and draft tests; no network access in tests.

struct ScriptedResponse: Sendable {
    let status: Int
    let body: Data
    /// nil means "respond"; non-nil means the transport throws this URLError code.
    let failure: URLError.Code?

    init(status: Int, json: String) {
        self.status = status
        self.body = Data(json.utf8)
        self.failure = nil
    }

    init(status: Int, body: Data) {
        self.status = status
        self.body = body
        self.failure = nil
    }

    init(failure: URLError.Code) {
        self.status = 0
        self.body = Data()
        self.failure = failure
    }
}

/// Records requests and replays scripted responses in order.
/// AIDEV-NOTE: NSLock.lock()/unlock() are unavailable from async contexts in Swift 6, so all shared
/// state is touched inside synchronous `withLock` closures (regression for review finding P11-1).
final class MockTransport: HTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var script: [ScriptedResponse]
    private var recorded: [URLRequest] = []
    private var recordedLimits: [ResponseLimits] = []

    init(_ script: [ScriptedResponse]) {
        self.script = script
    }

    var requests: [URLRequest] { lock.withLock { recorded } }
    var limits: [ResponseLimits] { lock.withLock { recordedLimits } }

    /// Records one request and dequeues its scripted response (nil when the script ran out).
    private func record(_ request: URLRequest, _ limits: ResponseLimits) -> ScriptedResponse? {
        lock.withLock {
            recorded.append(request)
            recordedLimits.append(limits)
            return script.isEmpty ? nil : script.removeFirst()
        }
    }

    func send(_ request: URLRequest, limits: ResponseLimits) async throws -> (Data, HTTPURLResponse) {
        guard let next = record(request, limits) else { throw URLError(.badServerResponse) }
        if let failure = next.failure {
            throw URLError(failure)
        }
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: next.status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (next.body, response)
    }
}

enum Fixtures {
    static let contextToken = "ctx_0123456789abcdef"
    static let authzToken = "authz_0123456789abcdef"
    static let csrfToken = "csrf_0123456789abcdef"

    static func context() throws -> SessionContext {
        SessionContext(session: try session())
    }

    static func session() throws -> Session {
        try JSONDecoder().decode(Session.self, from: Data(sessionJSON.utf8))
    }

    static let sessionJSON = """
    {
      "context_id": "\(contextToken)",
      "authorization_version": "\(authzToken)",
      "actor": {"id": "11111111-1111-1111-1111-111111111111", "display_name": "Test Actor"},
      "organization": {"id": "22222222-2222-2222-2222-222222222222", "name": "Elevateo"},
      "simulation_mode": true,
      "csrf_token": "\(csrfToken)"
    }
    """

    static let threadPageJSON = """
    {
      "context_id": "\(contextToken)",
      "authorization_version": "\(authzToken)",
      "next_cursor": null,
      "mailbox_id": "33333333-3333-3333-3333-333333333333",
      "items": [
        {
          "id": "44444444-4444-4444-4444-444444444444",
          "mailbox_id": "33333333-3333-3333-3333-333333333333",
          "subject": "Welcome",
          "subject_truncated": false,
          "sender": {"display_name": "Ana", "address": "ana@example.com"},
          "preview_text": "Hello there",
          "last_message_at": "2026-10-20T10:00:00Z",
          "unread": true,
          "message_count": 2,
          "folder": "inbox",
          "snoozed_until": null,
          "starred": false
        }
      ]
    }
    """

    static let errorJSON = """
    {"code": "unauthenticated", "message": "session expired", "request_id": "req-1"}
    """

    static let draftConflictJSON = """
    {"code": "draft_conflict", "message": "stale version", "request_id": "req-2"}
    """

    static let draftSaveResultJSON = """
    {
      "draft_id": "55555555-5555-5555-5555-555555555555",
      "operation_id": "66666666-6666-6666-6666-666666666666",
      "version": 1,
      "state": "editable"
    }
    """
}

func makeClient(_ transport: MockTransport) -> ElevateoAPIClient {
    ElevateoAPIClient(
        baseURL: URL(string: "https://mail.company.example")!,
        transport: transport,
        timeout: 5,
        requestIDProvider: { "test-request-id" }
    )
}
