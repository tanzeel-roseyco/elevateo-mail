# frozen_string_literal: true

require_relative "thread_reads"
require_relative "mailbox_membership_input"
require_relative "write_response"
require_relative "session_presentation"

module Elevateo
  # AIDEV-NOTE: Read snapshots and write guards belong to controllers; SQL alone mutates memberships and revisions.
  class MailboxMemberships < ThreadReads
    VERSION_SQL = "SELECT app.mailbox_membership_version($1::uuid) AS membership_version"
    PAGE_SQL = "SELECT user_id, compose, approve_send, manage_members FROM app.mailbox_members_page($1::uuid,$2::uuid,$3::integer)"
    CHANGE_SQL = <<~SQL.freeze
      SELECT app.change_mailbox_membership($1::text,$2::uuid,$3::uuid,$4::integer,
        $5::boolean,$6::boolean,$7::boolean,$8::boolean) AS result
    SQL

    def list(mailbox_id:, query:)
      limit = query_limit(query, maximum: 50, allowed: %w[cursor limit])
      mailbox = request_uuid(mailbox_id)
      row = rows(VERSION_SQL, [mailbox]).first
      version = row && row["membership_version"]
      raise CollaborationError.new("not_available") if version.nil?
      revision = ThreadProjection.integer(version, MailboxMembershipInput::MAX_VERSION)
      scope = cursor_scope(resource: "mailbox_members", filters: { "mailbox_id" => mailbox,
        "membership_version" => revision.to_s }, order: "user_id:asc", limit: limit)
      after = member_position(query["cursor"], scope)
      items = rows(PAGE_SQL, [mailbox, after, (limit + 1).to_s]).map { |item| MailboxMembershipInput.member(item) }
      ReadResponse.page(items: items, limit: limit, budget: ReadResponse::MAILBOX_BYTES,
        envelope: session_envelope.merge("mailbox_id" => mailbox, "membership_version" => revision),
        cursor_for: ->(item) { @cursors.encode(position: { "user_id" => ThreadProjection.uuid(item["user_id"]) }, scope: scope) })
    rescue InvalidQuery
      raise CollaborationError.new("request_invalid")
    rescue Cursors::Invalid
      raise CollaborationError.new("cursor_invalid")
    end

    def put(mailbox_id:, user_id:, input:, digest:, presentation:)
      expected, flags = MailboxMembershipInput.put(input)
      change(mailbox_id: mailbox_id, user_id: user_id, expected: expected, flags: flags,
             digest: digest, presentation: presentation)
    end

    def delete(mailbox_id:, user_id:, query:, digest:, presentation:)
      change(mailbox_id: mailbox_id, user_id: user_id, expected: MailboxMembershipInput.delete(query), flags: nil,
             digest: digest, presentation: presentation)
    end

    private

    def member_position(token, scope)
      return nil unless token
      decoded = @cursors.decode(token, scope: scope)
      raise Cursors::Invalid unless decoded.keys == ["user_id"]
      ThreadProjection.uuid(decoded["user_id"])
    rescue ReadResponse::Invalid
      raise Cursors::Invalid
    end

    def change(mailbox_id:, user_id:, expected:, flags:, digest:, presentation:)
      mailbox, user = WriteInput.uuid(mailbox_id), WriteInput.uuid(user_id)
      values = [digest, mailbox, user, expected.to_s, flags.nil?.to_s,
                *MailboxMembershipInput::FLAGS.map { |key| flags && flags.fetch(key).to_s }]
      row = rows(CHANGE_SQL, values).first
      result = ThreadProjection.source_json(row && row["result"], 16_384)
      raise CollaborationError.new("internal_error") unless result.is_a?(Hash)
      raise CollaborationError.new("membership_conflict") if result["status"] == "membership_conflict"
      SessionStore.check!(result)
      metadata = result["metadata"]
      unless metadata.is_a?(Hash) && metadata["user_id"] == @identity.user_id && metadata["organization_id"] == @identity.org_id
        raise CollaborationError.new("internal_error")
      end
      ThreadProjection.integer(metadata["authorization_generation"], 9_223_372_036_854_775_807)
      revision = ThreadProjection.integer(result["membership_version"], MailboxMembershipInput::MAX_VERSION)
      member = result["member"]
      if flags
        unless member.is_a?(Hash) && member.keys.sort == %w[capabilities user_id] && member["user_id"] == user
          raise CollaborationError.new("internal_error")
        end
        capabilities = member["capabilities"]
        unless capabilities.is_a?(Hash) && capabilities.keys.sort == MailboxMembershipInput::FLAGS.sort
          raise CollaborationError.new("internal_error")
        end
        # Database projection failures are server errors; request validation has already completed before locks.
        member = MailboxMembershipInput.member(capabilities.merge("user_id" => user))
      elsif !member.nil?
        raise CollaborationError.new("internal_error")
      end
      # Self-demotion changes the actor's generation; sign the fresh database metadata while guards remain held.
      envelope = session_envelope.merge("authorization_version" => presentation.version(metadata),
        "mailbox_id" => mailbox, "user_id" => user, "membership_version" => revision, "member" => member)
      WriteResponse.new(json: JSON.generate(envelope), status: 200).verify!(budget: 4096)
    rescue ReadResponse::Invalid
      raise CollaborationError.new("internal_error")
    end
  end
end
