# frozen_string_literal: true

require_relative "thread_collaboration"

module Elevateo
  class ThreadNotes < ThreadCollaboration
    REQUIRED = %w[mailbox_id note_id body_text].freeze
    COLUMNS = <<~SQL.freeze
      id, organization_id, mailbox_id, thread_id, author_id, body_text, version,
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
    SQL
    INSERT_SQL = <<~SQL.freeze
      INSERT INTO app.thread_notes(organization_id, mailbox_id, thread_id, id, author_id, body_text)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::text)
      ON CONFLICT (organization_id, id) DO NOTHING RETURNING #{COLUMNS}
    SQL
    EXISTING_SQL = "SELECT #{COLUMNS} FROM app.thread_notes WHERE organization_id = $1::uuid AND id = $2::uuid".freeze
    LIST_SQL = <<~SQL.freeze
      SELECT #{COLUMNS} FROM app.thread_notes
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND thread_id = $3::uuid
         AND ($4::uuid IS NULL OR (created_at, id) > ($5::timestamptz, $4::uuid))
       ORDER BY created_at ASC, id ASC LIMIT $6::integer
    SQL

    def initialize(connection:, identity:, session:, cursors:)
      super(connection: connection, identity: identity, session: session)
      @cursors = cursors
    end

    def self.validate!(input)
      keys!(input, REQUIRED)
      WriteInput.uuid(input["mailbox_id"])
      WriteInput.uuid(input["note_id"])
      WriteInput.text(input["body_text"], maximum: 4096)
      nil
    end

    def post(thread_id:, input:)
      self.class.validate!(input)
      thread, mailbox = WriteInput.uuid(thread_id), WriteInput.uuid(input["mailbox_id"])
      id, body = WriteInput.uuid(input["note_id"]), WriteInput.text(input["body_text"], maximum: 4096)
      resource!(thread, mailbox)
      row = rows(INSERT_SQL, [@identity.org_id, mailbox, thread, id, @identity.user_id, body]).first
      status = row ? 201 : 200
      # AIDEV-NOTE: DO NOTHING waits out a concurrent insert without aborting the transaction or exposing hidden IDs.
      unless row
        row = rows(EXISTING_SQL, [@identity.org_id, id]).first
        raise CollaborationError.new("not_available") unless row && row["author_id"] == @identity.user_id
        unless row["mailbox_id"] == mailbox && row["thread_id"] == thread && row["body_text"] == body
          raise CollaborationError.new("operation_mismatch")
        end
      end
      response(envelope(thread, mailbox).merge("note" => project(row)), status: status, budget: 65_536)
    end

    def list(thread_id:, query:)
      WriteInput.invalid! unless (query.keys - %w[mailbox_id limit cursor]).empty?
      thread, mailbox = WriteInput.uuid(thread_id), WriteInput.uuid(query["mailbox_id"])
      raw = query.fetch("limit", "50")
      WriteInput.invalid! unless /\A[1-9][0-9]?\z/.match?(raw) && raw.to_i <= 50
      limit = raw.to_i
      scope = envelope(thread, mailbox).slice("context_id", "authorization_version").merge(
        "actor_id" => @identity.user_id, "organization_id" => @identity.org_id, "resource" => "thread_notes",
        "filters" => { "mailbox_id" => mailbox, "thread_id" => thread }, "order" => "created_at:asc,id:asc", "limit" => limit)
      # AIDEV-NOTE: Current resource visibility takes priority over cursor errors, including stale cross-scope tokens.
      resource!(thread, mailbox)
      after = position(query["cursor"], scope)
      items = rows(LIST_SQL, [@identity.org_id, mailbox, thread, after["id"], after["created_at"], (limit + 1).to_s])
        .map { |row| project(row) }
      ReadResponse.page(items: items, limit: limit, envelope: envelope(thread, mailbox), budget: 262_144,
        cursor_for: ->(item) { @cursors.encode(position: { "id" => ThreadProjection.uuid(item["id"]),
          "created_at" => ThreadProjection.timestamp(item["created_at"]) }, scope: scope) })
    end

    private

    def position(token, scope)
      return {} unless token
      # AIDEV-NOTE: Supplied size failures use the cursor error seam after resource visibility has been checked.
      raise Cursors::Invalid, "invalid cursor" unless token.bytesize.between?(1, 2048)
      decoded = @cursors.decode(token, scope: scope)
      unless decoded.keys.sort == %w[created_at id] && !decoded["created_at"].nil?
        raise Cursors::Invalid, "invalid cursor"
      end
      { "id" => ThreadProjection.uuid(decoded["id"]), "created_at" => ThreadProjection.timestamp(decoded["created_at"]) }
    rescue ReadResponse::Invalid
      raise Cursors::Invalid, "invalid cursor"
    end

    def project(row)
      body = ThreadProjection.text(row["body_text"], 4096)
      time = ThreadProjection.timestamp(row["created_at"])
      if body.empty? || body.include?("\u0000") || time.nil? || row["version"] != 1
        raise ReadResponse::Invalid, "invalid note"
      end
      { "id" => ThreadProjection.uuid(row["id"]), "author_id" => ThreadProjection.uuid(row["author_id"]),
        "body_text" => body, "version" => 1, "created_at" => time }
    end
  end
end
