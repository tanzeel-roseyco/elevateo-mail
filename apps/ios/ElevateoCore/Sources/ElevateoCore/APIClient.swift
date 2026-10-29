import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// AIDEV-NOTE: typed client for contracts/v1; transport is injected so tests never touch the network.

public enum APIClientError: Error, Sendable {
    /// 401 anywhere: the cookie session is gone; callers must clear sensitive state and re-authenticate.
    case sessionExpired(requestID: String?)
    /// 409 draft_conflict: another save advanced the draft version; carries the server envelope.
    case draftConflict(ErrorPayload)
    /// Any other structured server error (404 not_available, 400, 429, 5xx...).
    case server(status: Int, payload: ErrorPayload)
    /// Response body did not decode as the contract shape.
    case invalidResponse(status: Int, underlying: any Error)
    /// Transport-level failure (offline, timeout, TLS); surfaced, never swallowed.
    case network(underlying: any Error)
    case cancelled
}

/// Narrow transport boundary. Production uses URLSession; tests use a scripted mock.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public struct URLSessionTransport: HTTPTransport {
    let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        // AIDEV-NOTE: continuation wrapper instead of session.data(for:) so Linux Foundation and cancellation both work.
        let task = TaskBox()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let dataTask = session.dataTask(with: request) { data, response, error in
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    guard let http = response as? HTTPURLResponse, let data else {
                        continuation.resume(throwing: URLError(.badServerResponse))
                        return
                    }
                    continuation.resume(returning: (data, http))
                }
                task.set(dataTask)
                dataTask.resume()
            }
        } onCancel: {
            task.cancel()
        }
    }

    // Holds the URLSessionDataTask so the cancellation handler can reach it across concurrency domains.
    private final class TaskBox: @unchecked Sendable {
        private let lock = NSLock()
        private var task: URLSessionDataTask?
        private var cancelled = false

        func set(_ t: URLSessionDataTask) {
            lock.lock()
            defer { lock.unlock() }
            task = t
            if cancelled { t.cancel() }
        }

        func cancel() {
            lock.lock()
            defer { lock.unlock() }
            cancelled = true
            task?.cancel()
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
}

public enum ThreadFilter: String, Sendable, CaseIterable {
    case all, unread, starred, snoozed, archive, spam, trash
}

public struct ElevateoAPIClient: Sendable {
    public let baseURL: URL
    let transport: HTTPTransport
    let timeout: TimeInterval
    let requestIDProvider: @Sendable () -> String

    public init(
        baseURL: URL,
        transport: HTTPTransport = URLSessionTransport(),
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
        try await get(path: "/v1/session", query: [], context: nil)
    }

    public func listMailboxes(context: SessionContext, cursor: String? = nil, limit: Int = 50) async throws -> MailboxPage {
        try await get(path: "/v1/mailboxes", query: pageQuery(cursor: cursor, limit: limit), context: context)
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
        return try await get(path: "/v1/mailboxes/\(canonical(mailboxID))/threads", query: query, context: context)
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
        return try await get(path: "/v1/threads/\(canonical(threadID))", query: query, context: context)
    }

    public func getDraft(draftID: UUID, mailboxID: UUID, context: SessionContext) async throws -> DraftResponse {
        try await get(
            path: "/v1/drafts/\(canonical(draftID))",
            query: [URLQueryItem(name: "mailbox_id", value: canonical(mailboxID))],
            context: context
        )
    }

    /// Create (expectedVersion 0) or update a reply draft. 409 draft_conflict surfaces as a typed error.
    public func saveDraft(draftID: UUID, input: DraftSaveInput, context: SessionContext) async throws -> DraftSaveResult {
        var request = try makeRequest(path: "/v1/drafts/\(canonical(draftID))", query: [], context: context)
        request.httpMethod = "PUT"
        // AIDEV-NOTE: C/D mutations additionally require Origin + X-CSRF-Token (CdOrigin/CdCsrf in the contract).
        request.setValue(origin(), forHTTPHeaderField: "Origin")
        request.setValue(context.csrfToken.rawValue, forHTTPHeaderField: "X-CSRF-Token")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let encoder = JSONEncoder()
        do {
            request.httpBody = try encoder.encode(input)
        } catch {
            throw APIClientError.invalidResponse(status: 0, underlying: error)
        }
        return try await perform(request)
    }

    // MARK: Plumbing

    private func pageQuery(cursor: String?, limit: Int) -> [URLQueryItem] {
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        return items
    }

    // UUIDs are sent lowercased; the server canonicalizes but we match the canonical form up front.
    private func canonical(_ id: UUID) -> String { id.uuidString.lowercased() }

    private func origin() -> String {
        var components = URLComponents()
        components.scheme = baseURL.scheme
        components.host = baseURL.host
        components.port = baseURL.port
        return components.string ?? baseURL.absoluteString
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

    private func get<T: Decodable>(path: String, query: [URLQueryItem], context: SessionContext?) async throws -> T {
        var request = try makeRequest(path: path, query: query, context: context)
        request.httpMethod = "GET"
        return try await perform(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await transport.send(request)
        } catch is CancellationError {
            throw APIClientError.cancelled
        } catch let urlError as URLError where urlError.code == .cancelled {
            throw APIClientError.cancelled
        } catch {
            throw APIClientError.network(underlying: error)
        }

        let decoder = JSONDecoder()
        if (200...299).contains(response.statusCode) {
            do {
                return try decoder.decode(T.self, from: data)
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
