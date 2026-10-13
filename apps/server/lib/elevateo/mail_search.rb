# frozen_string_literal: true

require_relative "thread_reads"
require_relative "mail_search_sql"
require_relative "write_input"

module Elevateo
  # AIDEV-NOTE: Inherit B's cursor scope and page authority; ReadController supplies the single RLS snapshot.
  class MailSearch < ThreadReads
    WHITE_SPACE = /\A[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+\z/

    def search(query:)
      # AIDEV-NOTE: C/D cursor errors follow scope checks; B's shared query validation keeps its existing semantics.
      limit = query_limit(query.reject { |key, _| key == "cursor" }, maximum: 50, allowed: %w[q mailbox_id limit])
      term = WriteInput.text(query["q"], maximum: 256)
      raise CollaborationError.new("request_invalid") if WHITE_SPACE.match?(term)
      mailbox = query.key?("mailbox_id") ? request_uuid(query["mailbox_id"]) : nil
      # AIDEV-NOTE: Resource authorization precedes all cursor validation, including empty and oversized tokens.
      if mailbox && rows(MAILBOX_SQL, [@identity.org_id, mailbox]).empty?
        raise CollaborationError.new("not_available")
      end
      scope = cursor_scope(resource: "search", filters: { "q" => term, "mailbox_id" => mailbox },
                           order: "last_message_at:desc:nulls_last,id:desc", limit: limit)
      after = position(query["cursor"], scope, "last_message_at")
      literal = "%#{term.gsub(/[\\%_]/) { |character| "\\#{character}" }}%"
      values = [@identity.org_id, mailbox, @identity.user_id, literal,
                after["id"], after["last_message_at"], (limit + 1).to_s]
      items = rows(MailSearchSQL::PAGE, values).map { |row| ThreadProjection.thread(row, summary: true) }
      ReadResponse.page(items: items, limit: limit,
                        envelope: session_envelope.merge("q" => term, "mailbox_id" => mailbox),
                        budget: ReadResponse::THREAD_BYTES,
                        cursor_for: ->(item) { encode_position(item, "last_message_at", scope) })
    rescue InvalidQuery
      raise CollaborationError.new("request_invalid")
    rescue Cursors::Invalid
      raise CollaborationError.new("cursor_invalid")
    end
  end
end
