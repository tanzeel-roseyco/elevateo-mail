import Foundation

// AIDEV-NOTE: screen-independent keyset pagination state shared by the conversation list and the
// conversation detail (both contract pages carry next_cursor). Lives in the Linux-testable core so
// refresh/pagination races and error transitions have unit tests; SwiftUI views only render it.

public struct CursorPager<Item: Identifiable & Sendable>: Sendable where Item.ID: Sendable {
    public private(set) var items: [Item] = []
    public private(set) var nextCursor: String?
    public private(set) var loadingMore = false
    /// Accessible message for a failed "load more"; cleared by a later success or refresh.
    public private(set) var paginationError: String?
    /// Bumped by every refresh; a page request started under an older generation is discarded.
    public private(set) var generation = 0

    public init() {}

    public var hasMore: Bool { nextCursor != nil }

    /// Starts a refresh: any outstanding "load more" becomes stale. Returns the refresh generation.
    public mutating func beginRefresh() -> Int {
        generation += 1
        loadingMore = false
        return generation
    }

    /// Replaces everything with a first page, unless a newer refresh superseded this one.
    @discardableResult
    public mutating func applyFirstPage(_ items: [Item], nextCursor: String?, generation: Int) -> Bool {
        guard generation == self.generation else { return false }
        self.items = Self.deduplicated(items)
        self.nextCursor = nextCursor
        paginationError = nil
        return true
    }

    /// Starts one continuation request; nil when there is nothing more or one is already running.
    public mutating func beginLoadMore() -> (cursor: String, generation: Int)? {
        guard let cursor = nextCursor, !loadingMore else { return nil }
        loadingMore = true
        paginationError = nil
        return (cursor, generation)
    }

    /// Appends a continuation page (deduplicated: order is not a snapshot across pages).
    @discardableResult
    public mutating func applyMore(_ page: [Item], nextCursor: String?, generation: Int) -> Bool {
        guard generation == self.generation else { return false }
        var seen = Set(items.map(\.id))
        items += page.filter { seen.insert($0.id).inserted }
        self.nextCursor = nextCursor
        loadingMore = false
        return true
    }

    /// Records a failed continuation so the view can say so and offer a retry.
    @discardableResult
    public mutating func failMore(_ message: String, generation: Int) -> Bool {
        guard generation == self.generation else { return false }
        loadingMore = false
        paginationError = message
        return true
    }

    private static func deduplicated(_ items: [Item]) -> [Item] {
        var seen = Set<Item.ID>()
        return items.filter { seen.insert($0.id).inserted }
    }
}
