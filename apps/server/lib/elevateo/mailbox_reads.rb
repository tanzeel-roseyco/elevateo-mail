# frozen_string_literal: true

require_relative "cursors"
require_relative "read_response"

module Elevateo
  # AIDEV-NOTE: ReadController supplies one authorized read-only snapshot; RLS remains the visibility authority.
  class MailboxReads
    class InvalidQuery < StandardError; end

    SQL = <<~SQL.freeze
      SELECT mailbox.id, mailbox.display_name, mailbox.display_address,
             COALESCE(membership.compose, FALSE) AS compose,
             COALESCE(membership.approve_send, FALSE) AS approve_send,
             COALESCE(membership.manage_members, FALSE) AS manage_members
        FROM app.mailboxes AS mailbox
        LEFT JOIN app.mailbox_memberships AS membership
          ON membership.organization_id = mailbox.organization_id
         AND membership.mailbox_id = mailbox.id AND membership.user_id = $1::uuid
       WHERE mailbox.organization_id = $2::uuid
         AND ($3::uuid IS NULL OR mailbox.id > $3::uuid)
       ORDER BY mailbox.id ASC
       LIMIT $4::integer
    SQL

    def initialize(cursor:)
      @cursor = cursor
    end

    def call(connection:, identity:, session:, query:)
      limit = query_limit(query)
      # @type var envelope: ReadResponse::item
      envelope = { "context_id" => session_token(session, "context_id"),
                   "authorization_version" => session_token(session, "authorization_version") }
      # @type var scope: Cursors::scope
      # @type var filters: Hash[String, String]
      filters = {}
      scope = envelope.merge("actor_id" => identity.user_id, "organization_id" => identity.org_id,
                             "resource" => "mailboxes", "filters" => filters, "order" => "id:asc", "limit" => limit)
      after = cursor_position(query["cursor"], scope)
      # AIDEV-NOTE: Fetch one authorized lookahead row, never a hidden count or privileged existence probe.
      binds = [identity.user_id, identity.org_id, after, (limit + 1).to_s].map do |value|
        ActiveRecord::Relation::QueryAttribute.new("mailbox_read", value, ActiveRecord::Type::String.new)
      end
      items = connection.exec_query(SQL, "Mailbox page", binds).to_a.map { |row| mailbox(row) }
      ReadResponse.page(items: items, limit: limit, envelope: envelope, budget: ReadResponse::MAILBOX_BYTES,
                        cursor_for: ->(item) { @cursor.encode(position: { "id" => item.fetch("id").to_s }, scope: scope) })
    end

    private

    def query_limit(query)
      raise InvalidQuery, "invalid request" unless (query.keys - %w[cursor limit]).empty?

      raw = query.fetch("limit", "50")
      unless raw.is_a?(String) && raw.ascii_only? && /\A(?:[1-9]|[1-4][0-9]|50)\z/.match?(raw)
        raise InvalidQuery, "invalid request"
      end
      if query.key?("cursor")
        token = query["cursor"]
        unless token.is_a?(String) && token.valid_encoding? && token.length.between?(1, Cursors::MAX_BYTES)
          raise InvalidQuery, "invalid request"
        end
      end
      raw.to_i
    end

    def cursor_position(token, scope)
      return nil unless token

      position = @cursor.decode(token, scope: scope)
      id = position["id"]
      raise Cursors::Invalid, "invalid cursor" unless position.keys == ["id"] && id && Cursors::UUID.match?(id)

      id
    end

    def session_token(session, key)
      value = session[key]
      unless value.is_a?(String) && value.ascii_only? && Cursors::TOKEN.match?(value)
        raise ReadResponse::Invalid, "invalid read response"
      end
      value
    end

    def mailbox(row)
      id = row["id"]
      unless id.is_a?(String) && id.ascii_only? && Cursors::UUID.match?(id)
        raise ReadResponse::Invalid, "invalid read response"
      end
      name = display_text(row["display_name"])
      address = row["display_address"].nil? ? nil : display_text(row["display_address"])
      # AIDEV-NOTE: Shared visibility grants read only; all write capabilities require explicit current metadata.
      # @type var capabilities: ReadResponse::item
      capabilities = { "read" => true }
      %w[compose approve_send manage_members].each do |key|
        value = row[key]
        raise ReadResponse::Invalid, "invalid read response" unless value == true || value == false

        capabilities[key] = value
      end
      { "id" => id, "display_name" => name, "display_address" => address, "capabilities" => capabilities }
    end

    def display_text(value)
      unless value.is_a?(String) && [Encoding::UTF_8, Encoding::US_ASCII].include?(value.encoding) &&
             value.valid_encoding? && value.length <= 256
        raise ReadResponse::Invalid, "invalid read response"
      end
      value
    end
  end
end
