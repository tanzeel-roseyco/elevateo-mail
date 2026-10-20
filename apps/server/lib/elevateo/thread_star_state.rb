# frozen_string_literal: true

require_relative "thread_collaboration"

module Elevateo
  class ThreadStarState < ThreadCollaboration
    REQUIRED = %w[mailbox_id starred].freeze
    THREAD_LOCK_SQL = <<~SQL.freeze
      SELECT id FROM app.threads
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND id = $3::uuid
       FOR UPDATE
    SQL
    STATE_SQL = <<~SQL.freeze
      SELECT starred, star_version,
             to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
        FROM app.thread_stars
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND thread_id = $3::uuid AND user_id = $4::uuid
       FOR UPDATE
    SQL
    SAVE_SQL = <<~SQL.freeze
      WITH saved AS (
        INSERT INTO app.thread_stars(organization_id, mailbox_id, thread_id, user_id, starred, star_version)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::boolean, 1)
        ON CONFLICT (organization_id, mailbox_id, thread_id, user_id) DO UPDATE
          SET starred = EXCLUDED.starred, star_version = app.thread_stars.star_version + 1,
              updated_at = clock_timestamp()
          WHERE app.thread_stars.starred IS DISTINCT FROM EXCLUDED.starred
            AND app.thread_stars.star_version < 2147483647
        RETURNING starred, star_version, updated_at
      )
      SELECT starred, star_version,
             to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
        FROM saved
      UNION ALL
      SELECT starred, star_version,
             to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
        FROM app.thread_stars
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid
         AND thread_id = $3::uuid AND user_id = $4::uuid
         AND NOT EXISTS (SELECT 1 FROM saved)
      LIMIT 1
    SQL

    def self.validate!(input)
      keys!(input, REQUIRED)
      WriteInput.uuid(input["mailbox_id"])
      WriteInput.boolean(input["starred"])
      nil
    end

    def put(thread_id:, input:)
      self.class.validate!(input)
      thread, mailbox = WriteInput.uuid(thread_id), WriteInput.uuid(input["mailbox_id"])
      desired = WriteInput.boolean(input["starred"])
      resource!(thread, mailbox)
      values = [@identity.org_id, mailbox, thread, @identity.user_id]
      # AIDEV-NOTE: Lock the stable parent before star lookup so first inserts serialize with folder writes and peers.
      raise ReadResponse::Invalid, "missing thread lock" if rows(THREAD_LOCK_SQL, values.first(3)).empty?
      row = rows(STATE_SQL, values).first || { "starred" => false, "star_version" => 0, "updated_at" => nil }
      if ThreadProjection.boolean(row["starred"]) != desired
        advance!(version(row, "star_version"))
        row = rows(SAVE_SQL, values + [desired ? "true" : "false"]).first
        raise ReadResponse::Invalid, "missing saved state" unless row
        version(row, "star_version")
        if ThreadProjection.boolean(row["starred"]) != desired
          raise CollaborationError.new("temporarily_unavailable")
        end
      end
      response(envelope(thread, mailbox).merge("starred" => ThreadProjection.boolean(row["starred"]),
        "star_version" => version(row, "star_version"),
        "updated_at" => ThreadProjection.timestamp(row["updated_at"])))
    end
  end
end
