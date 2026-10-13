# frozen_string_literal: true

require_relative "drafts/payload"
require_relative "drafts/database"
require_relative "drafts/projection"

module Elevateo
  # AIDEV-NOTE: Reads use the caller's protected snapshot; compose/ownership precede cursor semantics.
  class Drafts
    SUMMARY_BYTES = 262_144
    FULL_BYTES = 2_097_152
    LIST_SQL = <<~SQL.freeze
      SELECT id, mailbox_id, left(subject, 257) AS subject, reply_to_thread_id, version, state,
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
      FROM app.drafts WHERE organization_id = $1::uuid AND actor_id = $2::uuid AND mailbox_id = $3::uuid
        AND ($4::uuid IS NULL OR (updated_at, id) < ($5::timestamptz, $4::uuid))
      ORDER BY updated_at DESC, id DESC LIMIT $6::integer
    SQL
    DETAIL_SQL = <<~SQL.freeze
      SELECT id, mailbox_id, subject, recipients::text AS recipients, body_text, reply_to_thread_id, version, state,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
      FROM app.drafts WHERE organization_id = $1::uuid AND actor_id = $2::uuid AND mailbox_id = $3::uuid AND id = $4::uuid
    SQL

    def initialize(connection:, identity:, session:, cursors:)
      @database = Database.new(connection: connection, session: session)
      @identity = identity
      @cursors = cursors
    end

    def detail(draft_id:, query:)
      WriteInput.invalid! unless query.keys == ["mailbox_id"]
      mailbox = WriteInput.uuid(query["mailbox_id"])
      draft = WriteInput.uuid(draft_id)
      @database.authorize(mailbox, draft)
      row = @database.rows(DETAIL_SQL, [@identity.org_id, @identity.user_id, mailbox, draft]).first
      raise CollaborationError.new("not_available") unless row
      @database.encode(@database.envelope.merge("draft" => Projection.draft(row, summary: false)), budget: FULL_BYTES)
    end

    def list(query:)
      WriteInput.invalid! unless (query.keys - %w[mailbox_id cursor limit]).empty?
      mailbox = WriteInput.uuid(query["mailbox_id"])
      @database.authorize(mailbox)
      limit = page_limit(query)
      # @type var scope: Cursors::scope
      scope = @database.envelope.merge("actor_id" => @identity.user_id, "organization_id" => @identity.org_id,
        "resource" => "drafts", "filters" => { "mailbox_id" => mailbox }, "order" => "updated_at:desc,id:desc", "limit" => limit)
      after = position(query["cursor"], scope)
      values = [@identity.org_id, @identity.user_id, mailbox, after["id"], after["updated_at"], (limit + 1).to_s]
      items = @database.rows(LIST_SQL, values).map { |row| Projection.draft(row, summary: true) }
      ReadResponse.page(items: items, limit: limit, envelope: @database.envelope.merge("mailbox_id" => mailbox),
        budget: SUMMARY_BYTES, cursor_for: ->(item) {
          @cursors.encode(position: { "id" => ThreadProjection.uuid(item["id"]),
            "updated_at" => Projection.timestamp(item["updated_at"]) }, scope: scope)
        })
    end

    private

    def page_limit(query)
      raw = query.fetch("limit", "50")
      WriteInput.invalid! unless /\A[1-9][0-9]?\z/.match?(raw) && raw.to_i <= 50
      raw.to_i
    end

    def position(token, scope)
      return {} unless token
      raise Cursors::Invalid, "invalid draft cursor" unless token.bytesize.between?(1, 2048)
      decoded = @cursors.decode(token, scope: scope)
      raise Cursors::Invalid, "invalid draft cursor" unless decoded.keys.sort == %w[id updated_at]
      { "id" => ThreadProjection.uuid(decoded["id"]), "updated_at" => Projection.timestamp(decoded["updated_at"]) }
    rescue ReadResponse::Invalid
      raise Cursors::Invalid, "invalid draft cursor"
    end
  end
end
