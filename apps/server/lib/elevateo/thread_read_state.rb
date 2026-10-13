# frozen_string_literal: true

require_relative "thread_collaboration"

module Elevateo
  class ThreadReadState < ThreadCollaboration
    REQUIRED = %w[mailbox_id read].freeze
    STATE_SQL = <<~SQL.freeze
      SELECT is_read, read_state_version,
             to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
        FROM app.thread_read_states
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND thread_id = $3::uuid AND user_id = $4::uuid
       FOR UPDATE
    SQL
    SAVE_SQL = <<~SQL.freeze
      INSERT INTO app.thread_read_states(organization_id, mailbox_id, thread_id, user_id, is_read, read_state_version)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::boolean, 1)
      ON CONFLICT (organization_id, mailbox_id, thread_id, user_id) DO UPDATE
        SET is_read = EXCLUDED.is_read, read_state_version = app.thread_read_states.read_state_version + 1,
            updated_at = clock_timestamp()
      RETURNING is_read, read_state_version,
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    SQL

    def self.validate!(input)
      keys!(input, REQUIRED)
      WriteInput.uuid(input["mailbox_id"])
      WriteInput.boolean(input["read"])
      nil
    end

    def put(thread_id:, input:)
      self.class.validate!(input)
      thread, mailbox = WriteInput.uuid(thread_id), WriteInput.uuid(input["mailbox_id"])
      desired = WriteInput.boolean(input["read"])
      resource!(thread, mailbox)
      values = [@identity.org_id, mailbox, thread, @identity.user_id]
      # AIDEV-NOTE: The actor generation guard also serializes absent rows across that actor's different sessions.
      row = rows(STATE_SQL, values).first || { "is_read" => false, "read_state_version" => 0, "updated_at" => nil }
      if ThreadProjection.boolean(row["is_read"]) != desired
        advance!(version(row, "read_state_version"))
        row = rows(SAVE_SQL, values + [desired ? "true" : "false"]).first
        raise ReadResponse::Invalid, "missing saved state" unless row
      end
      response(envelope(thread, mailbox).merge("read" => ThreadProjection.boolean(row["is_read"]),
        "read_state_version" => version(row, "read_state_version"),
        "updated_at" => ThreadProjection.timestamp(row["updated_at"])))
    end
  end
end
