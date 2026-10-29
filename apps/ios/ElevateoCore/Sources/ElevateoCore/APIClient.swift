import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// AIDEV-NOTE: typed client for contracts/v1; transport is injected so tests never touch the network.
// Every response is bounded (contract x-max-response-bytes), decoded, contract-validated and bound
// to the request (context, mailbox, draft/operation identity) before a caller sees it.

public enum APIClientError: Error, Sendable {
    /// 401 anywhere: the cookie session is gone; callers must clear sensitive state and re-authenticate.
    case sessionExpired(requestID: String?)
    /// 409 draft_conflict: another save advanced the draft version; carries the server envelope.
    case draftConflict(ErrorPayload)
    /// Any other structured server error (404 not_available, 400, 429, 5xx...).
    case server(status: Int, payload: ErrorPayload)
    /// Response body did not decode as the contract shape or broke a contract bound.
    case invalidResponse(status: Int, underlying: any Error)
    /// The body exceeded the endpoint's contract byte limit; it was never parsed.
    case responseTooLarge(limit: Int)
    /// The server tried to redirect to another origin; the request was stopped (contract: no
    /// cross-origin redirect following).
    case redirectRejected
    /// The response belongs to another session context, mailbox, draft or operation.
    case responseMismatch(String)
    /// Transport-level failure (offline, timeout, TLS); surfaced, never swallowed. The server may
    /// still have applied a mutation; callers treat mutation outcomes as unconfirmed.
    case network(underlying: any Error)
    case cancelled
}

/// Byte limits for one request: `success` for 2xx bodies, `error` for everything else.
public struct ResponseLimits: Sendable, Equatable {
    public let success: Int
    public let error: Int

    public init(success: Int, error: Int = ResponseLimits.errorBytes) {
        self.success = success
        self.error = error
    }

    /// Contract: errors are at most 4 KiB on every route.
    public static let errorBytes = 4096

    public func limit(forStatus status: Int) -> Int {
        (200...299).contains(status) ? success : error
    }
}

/// Raised by transports that enforce limits and the redirect policy while streaming.
public enum TransportRejection: Error, Sendable, Equatable {
    case responseTooLarge(limit: Int)
    case redirectRejected
}

/// Narrow transport boundary. Production uses URLSession; tests use a scripted mock.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest, limits: ResponseLimits) async throws -> (Data, HTTPURLResponse)
}

/// Same-origin redirects only: scheme, host and effective port must all stay the same.
public enum RedirectPolicy {
    public static func allows(from original: URL?, to target: URL?) -> Bool {
        guard let original, let target,
              let a = URLComponents(url: original, resolvingAgainstBaseURL: false),
              let b = URLComponents(url: target, resolvingAgainstBaseURL: false)
        else { return false }
        func effectivePort(_ c: URLComponents) -> Int? {
            c.port ?? (c.scheme?.lowercased() == "https" ? 443 : c.scheme?.lowercased() == "http" ? 80 : nil)
        }
        return a.scheme?.lowercased() == b.scheme?.lowercased()
            && a.host?.lowercased() == b.host?.lowercased()
            && effectivePort(a) == effectivePort(b)
    }
}

/// Accumulates a response body and reports when it passes its limit (unit-tested without a network).
struct BoundedBody {
    let limit: Int
    private(set) var data = Data()

    init(limit: Int) { self.limit = limit }

    /// False once the body exceeds the limit; the caller must cancel the transfer.
    mutating func append(_ chunk: Data) -> Bool {
        guard data.count + chunk.count <= limit else { return false }
        data.append(chunk)
        return true
    }
}

// URLSession is documented thread-safe; @unchecked because Linux Foundation lacks the Sendable annotation.
public struct URLSessionTransport: HTTPTransport, @unchecked Sendable {
    private let session: URLSession
    private let delegate: BoundedTransferDelegate

    /// The default configuration keeps the shared cookie storage that carries the web session;
    /// sign-out clears that app's cookies explicitly (SessionLifecycle).
    public init(configuration: URLSessionConfiguration = .default) {
        let delegate = BoundedTransferDelegate()
        self.delegate = delegate
        self.session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
    }

    public func send(_ request: URLRequest, limits: ResponseLimits) async throws -> (Data, HTTPURLResponse) {
        let task = session.dataTask(with: request)
        let box = TaskBox(task)
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                delegate.register(taskID: task.taskIdentifier, limits: limits, continuation: continuation)
                task.resume()
            }
        } onCancel: {
            box.cancel()
        }
    }

    // Lets the cancellation handler reach the (non-Sendable on Linux) task across domains.
    private final class TaskBox: @unchecked Sendable {
        private let task: URLSessionDataTask
        init(_ task: URLSessionDataTask) { self.task = task }
        func cancel() { task.cancel() }
    }
}

/// Streams each task's body into a `BoundedBody`, cancelling at the first byte over the limit, and
/// refuses cross-origin redirects before they are followed.
/// AIDEV-NOTE: completion handlers are declared without @Sendable on purpose: on Linux the delegate
/// protocols are Swift protocols whose requirements lack it, and a mismatch is silently never called.
final class BoundedTransferDelegate: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private struct Transfer {
        let limits: ResponseLimits
        let continuation: CheckedContinuation<(Data, HTTPURLResponse), any Error>
        var response: HTTPURLResponse?
        var body: BoundedBody?
        var rejection: TransportRejection?
    }

    private let lock = NSLock()
    private var transfers: [Int: Transfer] = [:]

    func register(taskID: Int, limits: ResponseLimits, continuation: CheckedContinuation<(Data, HTTPURLResponse), any Error>) {
        lock.withLock { transfers[taskID] = Transfer(limits: limits, continuation: continuation) }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        if RedirectPolicy.allows(from: task.originalRequest?.url, to: request.url) {
            completionHandler(request)
            return
        }
        lock.withLock { transfers[task.taskIdentifier]?.rejection = .redirectRejected }
        completionHandler(nil)
        task.cancel()
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        let allow: Bool = lock.withLock {
            guard var transfer = transfers[dataTask.taskIdentifier], let http = response as? HTTPURLResponse else { return false }
            let limit = transfer.limits.limit(forStatus: http.statusCode)
            transfer.response = http
            transfer.body = BoundedBody(limit: limit)
            // A declared length over the limit is refused before any byte is read.
            if http.expectedContentLength > Int64(limit) { transfer.rejection = .responseTooLarge(limit: limit) }
            transfers[dataTask.taskIdentifier] = transfer
            return transfer.rejection == nil
        }
        completionHandler(allow ? .allow : .cancel)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        let overLimit: Bool = lock.withLock {
            guard var transfer = transfers[dataTask.taskIdentifier], var body = transfer.body else { return false }
            let fits = body.append(data)
            transfer.body = body
            if !fits { transfer.rejection = .responseTooLarge(limit: body.limit) }
            transfers[dataTask.taskIdentifier] = transfer
            return !fits
        }
        if overLimit { dataTask.cancel() }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        guard let transfer = lock.withLock({ transfers.removeValue(forKey: task.taskIdentifier) }) else { return }
        if let rejection = transfer.rejection {
            transfer.continuation.resume(throwing: rejection)
        } else if let error {
            transfer.continuation.resume(throwing: error)
        } else if let response = transfer.response {
            transfer.continuation.resume(returning: (transfer.body?.data ?? Data(), response))
        } else {
            transfer.continuation.resume(throwing: URLError(.badServerResponse))
        }
    }
}

/// Bootstrap context required on every data route; comes from GET /v1/session.
public struct SessionContext: Sendable, Equatable {
    public let contextID: OpaqueToken
    public let authorizationVersion: OpaqueToken
    public let csrfToken: OpaqueToken

    public init(session: Session) {
        self.contextID = session.contextID
        self.authorizationVersion = session.authorizationVersion
        self.csrfToken = session.csrfToken
    }

    func matches(_ contextID: OpaqueToken, _ authorizationVersion: OpaqueToken) -> Bool {
        self.contextID == contextID && self.authorizationVersion == authorizationVersion
    }
}

public enum ThreadFilter: String, Sendable, CaseIterable {
    case all, unread, starred, snoozed, archive, spam, trash
}

/// POST /v1/auth/logout result: local revocation is always confirmed; upstream may still be pending.
public struct AuthLogout: Sendable, Equatable, Codable, ContractValidated {
    public let localRevoked: Bool
    public let upstreamStatus: String

    enum CodingKeys: String, CodingKey {
        case localRevoked = "local_revoked"
        case upstreamStatus = "upstream_status"
    }

    public func validateContract() throws {
        try requireContract(localRevoked, "local_revoked is true")
        try requireContract(["complete", "pending"].contains(upstreamStatus), "upstream_status complete|pending")
    }
}

public struct ElevateoAPIClient: Sendable {
    public let baseURL: URL
    let transport: any HTTPTransport
    let timeout: TimeInterval
    let requestIDProvider: @Sendable () -> String

    // Contract x-max-response-bytes per route (contracts/v1/openapi.json).
    static let sessionBytes = 16_384
    static let mailboxesBytes = 131_072
    static let threadsBytes = 262_144
    static let detailBytes = 2_097_152
    static let mutationBytes = 4096

    public init(
        baseURL: URL,
        transport: any HTTPTransport = URLSessionTransport(),
        timeout: TimeInterval = 15,
        requestIDProvider: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() }
    ) {
        self.baseURL = baseURL
        self.transport = transport
        self.timeout = timeout
        self.requestIDProvider = requestIDProvider
    }

    // MARK: Endpoints

    public func getSession() async throws -> Session {
        try await get(path: "/v1/session", query: [], context: nil, limit: Self.sessionBytes)
    }

    public func listMailboxes(context: SessionContext, cursor: String? = nil, limit: Int = 50) async throws -> MailboxPage {
        let page: MailboxPage = try await get(
            path: "/v1/mailboxes", query: pageQuery(cursor: cursor, limit: limit), context: context, limit: Self.mailboxesBytes
        )
        try bind(context.matches(page.contextID, page.authorizationVersion), "session context changed")
        return page
    }

    public func listThreads(
        mailboxID: UUID,
        context: SessionContext,
        filter: ThreadFilter = .all,
        cursor: String? = nil,
        limit: Int = 50
    ) async throws -> ThreadPage {
        var query = pageQuery(cursor: cursor, limit: limit)
        query.append(URLQueryItem(name: "filter", value: filter.rawValue))
        let page: ThreadPage = try await get(
            path: "/v1/mailboxes/\(canonical(mailboxID))/threads", query: query, context: context, limit: Self.threadsBytes
        )
        try bind(context.matches(page.contextID, page.authorizationVersion), "session context changed")
        try bind(page.mailboxID == mailboxID, "page is for another mailbox")
        return page
    }

    public func getThread(
        threadID: UUID,
        mailboxID: UUID,
        context: SessionContext,
        cursor: String? = nil,
        limit: Int = 20
    ) async throws -> ThreadDetailPage {
        var query = [URLQueryItem(name: "mailbox_id", value: canonical(mailboxID))]
        query.append(contentsOf: pageQuery(cursor: cursor, limit: limit))
        let page: ThreadDetailPage = try await get(
            path: "/v1/threads/\(canonical(threadID))", query: query, context: context, limit: Self.detailBytes
        )
        try bind(context.matches(page.contextID, page.authorizationVersion), "session context changed")
        try bind(page.thread.id == threadID && page.thread.mailboxID == mailboxID, "conversation is not the requested one")
        return page
    }

    public func getDraft(draftID: UUID, mailboxID: UUID, context: SessionContext) async throws -> DraftResponse {
        let response: DraftResponse = try await get(
            path: "/v1/drafts/\(canonical(draftID))",
            query: [URLQueryItem(name: "mailbox_id", value: canonical(mailboxID))],
            context: context,
            limit: Self.detailBytes
        )
        try bind(context.matches(response.contextID, response.authorizationVersion), "session context changed")
        try bind(response.draft.id == draftID && response.draft.mailboxID == mailboxID, "draft is not the requested one")
        return response
    }

    /// Create (expectedVersion 0) or update a reply draft. 409 draft_conflict surfaces as a typed error.
    public func saveDraft(draftID: UUID, input: DraftSaveInput, context: SessionContext) async throws -> DraftSaveResult {
        var request = try makeMutation(path: "/v1/drafts/\(canonical(draftID))", method: "PUT", context: context)
        request.httpBody = try encodeBody(input)
        let result: DraftSaveResult = try await perform(request, limits: ResponseLimits(success: Self.mutationBytes))
        // A result for another draft or operation is not this save's outcome, whatever it says.
        try bind(result.draftID == draftID && result.operationID == input.operationID, "save result is for another draft or operation")
        return result
    }

    /// Server logout (POST /v1/auth/logout, scope local). Revokes the cookie session server-side.
    public func logout(context: SessionContext) async throws -> AuthLogout {
        var request = try makeMutation(path: "/v1/auth/logout", method: "POST", context: context)
        request.httpBody = Data("{}".utf8)
        return try await perform(request, limits: ResponseLimits(success: Self.mutationBytes))
    }

    // MARK: Plumbing

    private func pageQuery(cursor: String?, limit: Int) -> [URLQueryItem] {
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        return items
    }

    // UUIDs are sent lowercased; the server canonicalizes but we match the canonical form up front.
    private func canonical(_ id: UUID) -> String { id.uuidString.lowercased() }

    private func bind(_ condition: Bool, _ reason: String) throws {
        if !condition { throw APIClientError.responseMismatch(reason) }
    }

    private func origin() -> String {
        var components = URLComponents()
        components.scheme = baseURL.scheme
        components.host = baseURL.host
        components.port = baseURL.port
        return components.string ?? baseURL.absoluteString
    }

    private func encodeBody<T: Encodable>(_ value: T) throws -> Data {
        do {
            return try JSONEncoder().encode(value)
        } catch {
            throw APIClientError.invalidResponse(status: 0, underlying: error)
        }
    }

    private func makeRequest(path: String, query: [URLQueryItem], context: SessionContext?) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIClientError.network(underlying: URLError(.badURL))
        }
        components.path = path
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else {
            throw APIClientError.network(underlying: URLError(.badURL))
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(requestIDProvider(), forHTTPHeaderField: "X-Request-Id")
        if let context {
            request.setValue(context.contextID.rawValue, forHTTPHeaderField: "X-Session-Context")
            request.setValue(context.authorizationVersion.rawValue, forHTTPHeaderField: "X-Authorization-Version")
        }
        return request
    }

    // AIDEV-NOTE: C/D mutations additionally require Origin + X-CSRF-Token (CdOrigin/CdCsrf in the contract).
    private func makeMutation(path: String, method: String, context: SessionContext) throws -> URLRequest {
        var request = try makeRequest(path: path, query: [], context: context)
        request.httpMethod = method
        request.setValue(origin(), forHTTPHeaderField: "Origin")
        request.setValue(context.csrfToken.rawValue, forHTTPHeaderField: "X-CSRF-Token")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    private func get<T: Decodable>(path: String, query: [URLQueryItem], context: SessionContext?, limit: Int) async throws -> T {
        var request = try makeRequest(path: path, query: query, context: context)
        request.httpMethod = "GET"
        return try await perform(request, limits: ResponseLimits(success: limit))
    }

    private func perform<T: Decodable>(_ request: URLRequest, limits: ResponseLimits) async throws -> T {
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await transport.send(request, limits: limits)
        } catch TransportRejection.responseTooLarge(let limit) {
            throw APIClientError.responseTooLarge(limit: limit)
        } catch TransportRejection.redirectRejected {
            throw APIClientError.redirectRejected
        } catch is CancellationError {
            throw APIClientError.cancelled
        } catch let urlError as URLError where urlError.code == .cancelled {
            throw APIClientError.cancelled
        } catch {
            throw APIClientError.network(underlying: error)
        }

        // Defense in depth for transports that do not stream-bound: never parse an oversized body.
        let limit = limits.limit(forStatus: response.statusCode)
        guard data.count <= limit else { throw APIClientError.responseTooLarge(limit: limit) }

        let decoder = JSONDecoder()
        if (200...299).contains(response.statusCode) {
            do {
                let value = try decoder.decode(T.self, from: data)
                try (value as? any ContractValidated)?.validateContract()
                return value
            } catch {
                throw APIClientError.invalidResponse(status: response.statusCode, underlying: error)
            }
        }

        let payload = try? decoder.decode(ErrorPayload.self, from: data)
        switch response.statusCode {
        case 401:
            // Contract: clear sensitive client state on any 401.
            throw APIClientError.sessionExpired(requestID: payload?.requestID)
        case 409:
            if let payload, payload.code == .draftConflict {
                throw APIClientError.draftConflict(payload)
            }
            if let payload {
                throw APIClientError.server(status: 409, payload: payload)
            }
            throw APIClientError.invalidResponse(status: 409, underlying: URLError(.badServerResponse))
        default:
            if let payload {
                throw APIClientError.server(status: response.statusCode, payload: payload)
            }
            throw APIClientError.invalidResponse(
                status: response.statusCode,
                underlying: URLError(.badServerResponse)
            )
        }
    }
}
