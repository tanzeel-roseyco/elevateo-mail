# frozen_string_literal: true

require_relative "thread_projection"

module Elevateo
  # AIDEV-NOTE: ReadController owns the authorized snapshot; these queries neither open transactions nor mark read.
  class ThreadReads
    class NotAvailable < StandardError; end
    class InvalidQuery < StandardError; end

    MAILBOX_SQL = <<~SQL.freeze
      SELECT id FROM app.mailboxes WHERE organization_id = $1::uuid AND id = $2::uuid LIMIT 1
    SQL

    LIST_SQL = <<~SQL.freeze
      WITH page AS (
        SELECT thread.id, thread.mailbox_id, left(thread.subject, 257) AS subject,
               NOT COALESCE(state.is_read, FALSE) AS unread, thread.folder,
               to_char(thread.snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS snoozed_until,
               COALESCE(star.starred, FALSE) AS starred, latest.id AS latest_id,
               latest.sent_at AS activity
          FROM app.threads AS thread
          LEFT JOIN app.thread_read_states AS state
            ON state.organization_id = thread.organization_id AND state.mailbox_id = thread.mailbox_id
           AND state.thread_id = thread.id AND state.user_id = $3::uuid
          LEFT JOIN app.thread_stars AS star
            ON star.organization_id = thread.organization_id AND star.mailbox_id = thread.mailbox_id
           AND star.thread_id = thread.id AND star.user_id = $3::uuid
          LEFT JOIN LATERAL (
            SELECT message.id, message.sent_at FROM app.messages AS message
             WHERE message.organization_id = $1::uuid AND message.mailbox_id = $2::uuid
               AND message.thread_id = thread.id
             ORDER BY message.sent_at DESC NULLS LAST, message.id DESC LIMIT 1
          ) AS latest ON TRUE
         WHERE thread.organization_id = $1::uuid AND thread.mailbox_id = $2::uuid
           AND CASE $4::text
             WHEN 'all' THEN thread.folder = 'inbox' AND
               (thread.snoozed_until IS NULL OR thread.snoozed_until <= clock_timestamp())
             WHEN 'unread' THEN thread.folder = 'inbox' AND
               (thread.snoozed_until IS NULL OR thread.snoozed_until <= clock_timestamp()) AND
               NOT COALESCE(state.is_read, FALSE)
             WHEN 'starred' THEN COALESCE(star.starred, FALSE) AND thread.folder NOT IN ('spam', 'trash')
             WHEN 'snoozed' THEN thread.folder = 'inbox' AND thread.snoozed_until > clock_timestamp()
             WHEN 'archive' THEN thread.folder = 'archive'
             WHEN 'spam' THEN thread.folder = 'spam'
             WHEN 'trash' THEN thread.folder = 'trash'
             ELSE FALSE END
           AND ($5::uuid IS NULL OR
             ($6::timestamptz IS NULL AND latest.sent_at IS NULL AND thread.id < $5::uuid) OR
             ($6::timestamptz IS NOT NULL AND (latest.sent_at IS NULL OR latest.sent_at < $6::timestamptz OR
               (latest.sent_at = $6::timestamptz AND thread.id < $5::uuid))))
         ORDER BY latest.sent_at DESC NULLS LAST, thread.id DESC LIMIT $7::integer
      )
      SELECT page.id, page.mailbox_id, page.subject, page.unread, page.folder, page.snoozed_until,
             page.starred, latest.sender::text AS sender,
             COALESCE(left(latest.body_text, 256), '') AS preview_text,
             to_char(page.activity AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_message_at,
             (SELECT LEAST(count(message.id), 2147483647)::integer FROM app.messages AS message
               WHERE message.organization_id = $1::uuid AND message.mailbox_id = $2::uuid
                 AND message.thread_id = page.id) AS message_count
        FROM page LEFT JOIN app.messages AS latest
          ON latest.organization_id = $1::uuid AND latest.mailbox_id = $2::uuid
         AND latest.thread_id = page.id AND latest.id = page.latest_id
       ORDER BY page.activity DESC NULLS LAST, page.id DESC
    SQL

    THREAD_SQL = <<~SQL.freeze
      SELECT thread.id, thread.mailbox_id, left(thread.subject, 999) AS subject,
             NOT COALESCE(state.is_read, FALSE) AS unread, thread.folder,
             to_char(thread.snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS snoozed_until,
             COALESCE(star.starred, FALSE) AS starred,
             (SELECT LEAST(count(message.id), 2147483647)::integer FROM app.messages AS message
               WHERE message.organization_id = $1::uuid AND message.mailbox_id = $2::uuid
                 AND message.thread_id = thread.id) AS message_count
        FROM app.threads AS thread LEFT JOIN app.thread_read_states AS state
          ON state.organization_id = thread.organization_id AND state.mailbox_id = thread.mailbox_id
         AND state.thread_id = thread.id AND state.user_id = $3::uuid
        LEFT JOIN app.thread_stars AS star
          ON star.organization_id = thread.organization_id AND star.mailbox_id = thread.mailbox_id
         AND star.thread_id = thread.id AND star.user_id = $3::uuid
       WHERE thread.organization_id = $1::uuid AND thread.mailbox_id = $2::uuid AND thread.id = $4::uuid
       LIMIT 1
    SQL

    MESSAGES_SQL = <<~SQL.freeze
      SELECT message.id, message.sender::text AS sender, message.recipients::text AS recipients,
             left(message.body_text, 16385) AS body_text,
             message.attachment_count,
             to_char(message.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sent_at
        FROM app.messages AS message
       WHERE message.organization_id = $1::uuid AND message.mailbox_id = $2::uuid AND message.thread_id = $3::uuid
         AND ($4::uuid IS NULL OR
           ($5::timestamptz IS NULL AND (message.sent_at IS NOT NULL OR message.id > $4::uuid)) OR
           ($5::timestamptz IS NOT NULL AND (message.sent_at > $5::timestamptz OR
             (message.sent_at = $5::timestamptz AND message.id > $4::uuid))))
       ORDER BY message.sent_at ASC NULLS FIRST, message.id ASC LIMIT $6::integer
    SQL

    # AIDEV-NOTE: A permalink resolves one scoped row; a cursor walk would make late messages unreachable.
    DIRECT_MESSAGE_SQL = <<~SQL.freeze
      SELECT message.id, message.sender::text AS sender, message.recipients::text AS recipients,
             left(message.body_text, 16385) AS body_text, message.attachment_count,
             to_char(message.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sent_at
        FROM app.mailboxes AS mailbox
        JOIN app.threads AS thread ON thread.organization_id = mailbox.organization_id
          AND thread.mailbox_id = mailbox.id AND thread.id = $3::uuid
        JOIN app.messages AS message ON message.organization_id = thread.organization_id
          AND message.mailbox_id = thread.mailbox_id AND message.thread_id = thread.id
          AND message.id = $4::uuid
       WHERE mailbox.organization_id = $1::uuid AND mailbox.id = $2::uuid
       LIMIT 1
    SQL

    def initialize(connection:, identity:, session:, cursors:)
      @connection = connection
      @identity = identity
      @session = session
      @cursors = cursors
    end

    def list(mailbox_id:, query:)
      limit = query_limit(query, maximum: 50, allowed: %w[cursor limit filter])
      mailbox = request_uuid(mailbox_id)
      filter = query.fetch("filter", "all")
      raise InvalidQuery, "invalid request" unless %w[all unread starred snoozed archive spam trash].include?(filter)

      envelope = session_envelope.merge("mailbox_id" => mailbox)
      scope = cursor_scope(resource: "threads", filters: { "mailbox_id" => mailbox, "filter" => filter },
                           order: "last_message_at:desc:nulls_last,id:desc", limit: limit)
      after = position(query["cursor"], scope, "last_message_at")
      raise NotAvailable, "not available" if rows(MAILBOX_SQL, [@identity.org_id, mailbox]).empty?

      values = [@identity.org_id, mailbox, @identity.user_id, filter, after["id"], after["last_message_at"], (limit + 1).to_s]
      items = rows(LIST_SQL, values).map { |row| ThreadProjection.thread(row, summary: true) }
      ReadResponse.page(items: items, limit: limit, envelope: envelope, budget: ReadResponse::THREAD_BYTES,
                        cursor_for: ->(item) { encode_position(item, "last_message_at", scope) })
    end

    def detail(thread_id:, query:)
      limit = query_limit(query, maximum: 20, allowed: %w[mailbox_id cursor limit])
      mailbox = request_uuid(query["mailbox_id"])
      thread = request_uuid(thread_id)
      scope = cursor_scope(resource: "thread_messages", filters: { "mailbox_id" => mailbox, "thread_id" => thread },
                           order: "sent_at:asc:nulls_first,id:asc", limit: limit)
      after = position(query["cursor"], scope, "sent_at")
      row = rows(THREAD_SQL, [@identity.org_id, mailbox, @identity.user_id, thread]).first
      raise NotAvailable, "not available" unless row

      envelope = session_envelope.merge("thread" => ThreadProjection.thread(row, summary: false))
      values = [@identity.org_id, mailbox, thread, after["id"], after["sent_at"], (limit + 1).to_s]
      items = rows(MESSAGES_SQL, values).map { |message| ThreadProjection.message(message) }
      ReadResponse.page(items: items, limit: limit, envelope: envelope, budget: ReadResponse::MESSAGE_BYTES,
                        items_key: "messages", cursor_for: ->(item) { encode_position(item, "sent_at", scope) })
    end

    def direct_message(thread_id:, message_id:, query:)
      raise InvalidQuery, "invalid request" unless query.keys == ["mailbox_id"]

      mailbox = request_uuid(query["mailbox_id"])
      thread = request_uuid(thread_id)
      message = request_uuid(message_id)
      row = rows(DIRECT_MESSAGE_SQL, [@identity.org_id, mailbox, thread, message]).first
      raise NotAvailable, "not available" unless row

      ReadResponse.single(item: session_envelope.merge("mailbox_id" => mailbox, "thread_id" => thread,
                                                        "message" => ThreadProjection.message(row)))
    end

    private

    def rows(sql, values)
      binds = values.map do |value|
        ActiveRecord::Relation::QueryAttribute.new("thread_read", value, ActiveRecord::Type::String.new)
      end
      @connection.exec_query(sql, "Thread read", binds).to_a
    end

    def query_limit(query, maximum:, allowed:)
      raise InvalidQuery, "invalid request" unless (query.keys - allowed).empty?

      raw = query.fetch("limit", maximum.to_s)
      unless raw.is_a?(String) && raw.valid_encoding? && raw.ascii_only? &&
             /\A[1-9][0-9]?\z/.match?(raw) && raw.to_i <= maximum
        raise InvalidQuery, "invalid request"
      end
      token = query["cursor"]
      if query.key?("cursor") && !(token.is_a?(String) && token.valid_encoding? && token.bytesize.between?(1, 2048))
        raise InvalidQuery, "invalid request"
      end
      raw.to_i
    end

    def request_uuid(value)
      unless value.is_a?(String) && value.ascii_only? && value.valid_encoding? && Cursors::UUID.match?(value)
        raise InvalidQuery, "invalid request"
      end
      value.downcase
    end

    def session_envelope
      %w[context_id authorization_version].to_h do |key|
        value = @session[key]
        unless value.is_a?(String) && value.ascii_only? && Cursors::TOKEN.match?(value)
          raise ReadResponse::Invalid, "invalid read response"
        end
        [key, value]
      end
    end

    def cursor_scope(resource:, filters:, order:, limit:)
      session_envelope.merge("actor_id" => @identity.user_id, "organization_id" => @identity.org_id,
                             "resource" => resource, "filters" => filters, "order" => order, "limit" => limit)
    end

    def position(token, scope, timestamp_key)
      return {} unless token

      decoded = @cursors.decode(token, scope: scope)
      unless decoded.keys.sort == ["id", timestamp_key].sort
        raise Cursors::Invalid, "invalid cursor"
      end
      { "id" => ThreadProjection.uuid(decoded["id"]), timestamp_key => ThreadProjection.timestamp(decoded[timestamp_key]) }
    rescue ReadResponse::Invalid
      raise Cursors::Invalid, "invalid cursor"
    end

    def encode_position(item, timestamp_key, scope)
      @cursors.encode(position: { "id" => ThreadProjection.uuid(item["id"]),
                                 timestamp_key => ThreadProjection.timestamp(item[timestamp_key]) }, scope: scope)
    end
  end
end
