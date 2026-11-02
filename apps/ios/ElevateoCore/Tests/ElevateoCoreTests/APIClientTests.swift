import XCTest
#if canImport(FoundationNetworking)
// AIDEV-NOTE: Linux exposes URLRequest and HTTPURLResponse in a separate Foundation module.
import FoundationNetworking
#endif
@testable import ElevateoCore

/// Minimal identifiable item for pager tests.
private struct Item: Identifiable, Sendable {
    let id: Int
    init(_ id: Int) { self.id = id }
}

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

    private let mailboxID = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!

    // Regression (P08-1): an oversized success body is rejected before parsing, with the route limit.
    func testOversizedSuccessBodyIsRejectedWithTheRouteLimit() async throws {
        let transport = MockTransport([ScriptedResponse(status: 200, body: Data(repeating: 0x20, count: 262_145))])
        do {
            _ = try await makeClient(transport).listThreads(mailboxID: mailboxID, context: try Fixtures.context())
            XCTFail("expected responseTooLarge")
        } catch let error as APIClientError {
            guard case .responseTooLarge(let limit) = error else { return XCTFail("unexpected \(error)") }
            XCTAssertEqual(limit, 262_144)
        }
        XCTAssertEqual(transport.limits, [ResponseLimits(success: 262_144)])
    }

    // Regression (P08-1): error bodies are capped at 4 KiB on every route.
    func testOversizedErrorBodyIsRejected() async throws {
        let transport = MockTransport([ScriptedResponse(status: 500, body: Data(repeating: 0x20, count: 4097))])
        do {
            _ = try await makeClient(transport).getSession()
            XCTFail("expected responseTooLarge")
        } catch let error as APIClientError {
            guard case .responseTooLarge(let limit) = error else { return XCTFail("unexpected \(error)") }
            XCTAssertEqual(limit, 4096)
        }
    }

    // Regression (P08-1): the streaming accumulator stops at the first byte over its limit.
    func testBoundedBodyStopsAtTheLimit() {
        var body = BoundedBody(limit: 4)
        XCTAssertTrue(body.append(Data([1, 2, 3])))
        XCTAssertFalse(body.append(Data([4, 5])))
        XCTAssertEqual(body.data.count, 3)
    }

    // Regression (P08-2): redirects may not change scheme, host or effective port, for GET or mutation.
    func testRedirectPolicyAllowsOnlySameOrigin() {
        let api = URL(string: "https://mail.company.example/v1/drafts/1")!
        XCTAssertTrue(RedirectPolicy.allows(from: api, to: URL(string: "https://mail.company.example:443/v1/drafts/2")!))
        XCTAssertFalse(RedirectPolicy.allows(from: api, to: URL(string: "https://evil.example/v1/drafts/1")!))
        XCTAssertFalse(RedirectPolicy.allows(from: api, to: URL(string: "http://mail.company.example/v1/drafts/1")!))
        XCTAssertFalse(RedirectPolicy.allows(from: api, to: URL(string: "https://mail.company.example:8443/v1/drafts/1")!))
        XCTAssertFalse(RedirectPolicy.allows(from: api, to: nil))
    }

    // Regression (P08-2): a transport-level redirect rejection surfaces as a typed error.
    func testRejectedRedirectIsTyped() async throws {
        struct RedirectingTransport: HTTPTransport {
            func send(_ request: URLRequest, limits: ResponseLimits) async throws -> (Data, HTTPURLResponse) {
                throw TransportRejection.redirectRejected
            }
        }
        let client = ElevateoAPIClient(baseURL: URL(string: "https://mail.company.example")!, transport: RedirectingTransport())
        do {
            _ = try await client.getSession()
            XCTFail("expected redirectRejected")
        } catch let error as APIClientError {
            guard case .redirectRejected = error else { return XCTFail("unexpected \(error)") }
        }
    }

    // Regression (P08-3): a page for another mailbox or another session context is not returned.
    func testPageForAnotherMailboxOrContextIsRejected() async throws {
        let otherMailbox = UUID(uuidString: "77777777-7777-7777-7777-777777777777")!
        let foreignContext = Fixtures.threadPageJSON.replacingOccurrences(of: Fixtures.contextToken, with: "ctx_ffffffffffffffff")
        let transport = MockTransport([
            ScriptedResponse(status: 200, json: Fixtures.threadPageJSON),
            ScriptedResponse(status: 200, json: foreignContext),
        ])
        let client = makeClient(transport)
        for target in [otherMailbox, mailboxID] {
            do {
                _ = try await client.listThreads(mailboxID: target, context: try Fixtures.context())
                XCTFail("expected responseMismatch")
            } catch let error as APIClientError {
                guard case .responseMismatch = error else { return XCTFail("unexpected \(error)") }
            }
        }
    }

    // Regression (P10-2): contract bounds beyond Codable: too many items, missing next_cursor key.
    func testContractInvalidPagesAreRejected() async throws {
        let missingCursor = Fixtures.threadPageJSON.replacingOccurrences(of: "\"next_cursor\": null,", with: "")
        let summary = """
        {"id": "ID", "mailbox_id": "33333333-3333-3333-3333-333333333333", "subject": "s", "subject_truncated": false,
         "sender": null, "preview_text": "p", "last_message_at": null, "unread": false, "message_count": 1,
         "folder": "inbox", "snoozed_until": null, "starred": false}
        """
        let items = (0..<51).map { _ in summary.replacingOccurrences(of: "ID", with: UUID().uuidString.lowercased()) }.joined(separator: ",")
        let tooMany = """
        {"context_id": "\(Fixtures.contextToken)", "authorization_version": "\(Fixtures.authzToken)",
         "next_cursor": null, "mailbox_id": "33333333-3333-3333-3333-333333333333", "items": [\(items)]}
        """
        let transport = MockTransport([
            ScriptedResponse(status: 200, json: missingCursor),
            ScriptedResponse(status: 200, json: tooMany),
        ])
        let client = makeClient(transport)
        for _ in 0..<2 {
            do {
                _ = try await client.listThreads(mailboxID: mailboxID, context: try Fixtures.context())
                XCTFail("expected invalidResponse")
            } catch let error as APIClientError {
                guard case .invalidResponse(let status, _) = error else { return XCTFail("unexpected \(error)") }
                XCTAssertEqual(status, 200)
            }
        }
    }

    // P04-1: logout posts to the contracted route with CSRF + Origin and validates the result.
    func testLogoutPostsTheContractedRequest() async throws {
        let transport = MockTransport([ScriptedResponse(status: 200, json: #"{"local_revoked": true, "upstream_status": "pending"}"#)])
        let result = try await makeClient(transport).logout(context: try Fixtures.context())
        XCTAssertEqual(result.upstreamStatus, "pending")
        let request = transport.requests[0]
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/v1/auth/logout")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), Fixtures.csrfToken)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://mail.company.example")
    }

    // P06/P07: keyset pagination appends, deduplicates and keeps the cursor of the latest page.
    func testCursorPagerAppendsDeduplicatedPages() throws {
        var pager = CursorPager<Item>()
        let generation = pager.beginRefresh()
        XCTAssertTrue(pager.applyFirstPage([Item(1), Item(2)], nextCursor: "c1", generation: generation))
        let request = try XCTUnwrap(pager.beginLoadMore())
        XCTAssertEqual(request.cursor, "c1")
        XCTAssertNil(pager.beginLoadMore(), "one continuation at a time")
        pager.applyMore([Item(2), Item(3)], nextCursor: nil, generation: request.generation)
        XCTAssertEqual(pager.items.map(\.id), [1, 2, 3])
        XCTAssertFalse(pager.hasMore)
    }

    // Regression (P07-1): a failed continuation is visible and retryable, then cleared on success.
    func testCursorPagerReportsAndClearsPaginationFailure() throws {
        var pager = CursorPager<Item>()
        pager.applyFirstPage([Item(1)], nextCursor: "c1", generation: pager.beginRefresh())
        let first = try XCTUnwrap(pager.beginLoadMore())
        pager.failMore("More conversations could not be loaded.", generation: first.generation)
        XCTAssertEqual(pager.paginationError, "More conversations could not be loaded.")
        XCTAssertFalse(pager.loadingMore)
        let retry = try XCTUnwrap(pager.beginLoadMore(), "the same cursor is retried")
        XCTAssertNil(pager.paginationError)
        pager.applyMore([Item(2)], nextCursor: nil, generation: retry.generation)
        XCTAssertEqual(pager.items.map(\.id), [1, 2])
    }

    // Regression (P07-2): a late continuation from before a refresh cannot overwrite the refreshed list.
    func testRefreshInvalidatesAnOutstandingContinuation() throws {
        var pager = CursorPager<Item>()
        pager.applyFirstPage([Item(1)], nextCursor: "old", generation: pager.beginRefresh())
        let stale = try XCTUnwrap(pager.beginLoadMore())
        let refresh = pager.beginRefresh()
        XCTAssertTrue(pager.applyFirstPage([Item(9)], nextCursor: "new", generation: refresh))
        XCTAssertFalse(pager.applyMore([Item(2)], nextCursor: "stale", generation: stale.generation))
        XCTAssertFalse(pager.failMore("late", generation: stale.generation))
        XCTAssertEqual(pager.items.map(\.id), [9])
        XCTAssertEqual(pager.nextCursor, "new")
        XCTAssertNil(pager.paginationError)
    }
}
