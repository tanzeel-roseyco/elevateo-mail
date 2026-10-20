# frozen_string_literal: true

require_relative "thread_collaboration"

module Elevateo
  # AIDEV-NOTE: Folder and snooze share one version because both mutate the same mailbox-shared state row.
  class ThreadFolderState < ThreadCollaboration
    FOLDER_REQUIRED = %w[folder mailbox_id].freeze
    SNOOZE_REQUIRED = %w[mailbox_id snoozed_until].freeze
    STATE_SQL = <<~SQL.freeze
      SELECT folder,
             to_char(snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS snoozed_until,
             folder_version,
             to_char(folder_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
        FROM app.threads
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND id = $3::uuid
       FOR UPDATE
    SQL
    SAVE_FOLDER_SQL = <<~SQL.freeze
      UPDATE app.threads SET folder = $4::text, folder_version = folder_version + 1,
             folder_updated_at = clock_timestamp()
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND id = $3::uuid
      RETURNING folder,
        to_char(snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS snoozed_until,
        folder_version,
        to_char(folder_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    SQL
    VALID_SNOOZE_SQL = <<~SQL.freeze
      WITH current_clock AS (SELECT clock_timestamp() AS value)
      SELECT $1::timestamptz BETWEEN value + interval '60 seconds'
        AND value + interval '366 days' AS valid FROM current_clock
    SQL
    SAVE_SNOOZE_SQL = <<~SQL.freeze
      UPDATE app.threads SET folder = CASE WHEN $4::timestamptz IS NULL THEN folder ELSE 'inbox' END,
             snoozed_until = $4::timestamptz, folder_version = folder_version + 1,
             folder_updated_at = clock_timestamp()
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND id = $3::uuid
      RETURNING folder,
        to_char(snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS snoozed_until,
        folder_version,
        to_char(folder_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    SQL

    def self.validate_folder!(input)
      keys!(input, FOLDER_REQUIRED)
      WriteInput.uuid(input["mailbox_id"])
      WriteInput.folder(input["folder"])
      nil
    end

    def self.validate_snooze!(input)
      keys!(input, SNOOZE_REQUIRED)
      WriteInput.uuid(input["mailbox_id"])
      WriteInput.nullable_timestamp(input["snoozed_until"])
      nil
    end

    def put_folder(thread_id:, input:)
      self.class.validate_folder!(input)
      mutate(thread_id, input, folder: WriteInput.folder(input["folder"]), snooze: false)
    end

    def put_snooze(thread_id:, input:)
      self.class.validate_snooze!(input)
      desired = WriteInput.nullable_timestamp(input["snoozed_until"])
      mutate(thread_id, input, folder: nil, snooze: true, desired_snooze: desired)
    end

    private

    def mutate(thread_id, input, folder:, snooze:, desired_snooze: nil)
      thread, mailbox = WriteInput.uuid(thread_id), WriteInput.uuid(input["mailbox_id"])
      resource!(thread, mailbox)
      values = [@identity.org_id, mailbox, thread]
      row = rows(STATE_SQL, values).first
      raise ReadResponse::Invalid, "missing folder state" unless row
      if snooze && desired_snooze &&
         !ThreadProjection.boolean(rows(VALID_SNOOZE_SQL, [desired_snooze]).fetch(0).fetch("valid"))
        WriteInput.invalid!
      end

      current_snooze = ThreadProjection.timestamp(row["snoozed_until"])
      desired_folder = snooze && desired_snooze ? "inbox" : folder
      changed = if snooze
                  current_snooze != desired_snooze || (desired_snooze && row["folder"] != "inbox")
                else
                  row["folder"] != desired_folder
                end
      if changed
        advance!(version(row, "folder_version"))
        sql = snooze ? SAVE_SNOOZE_SQL : SAVE_FOLDER_SQL
        desired_value = snooze ? desired_snooze : desired_folder
        row = rows(sql, values + [desired_value]).first
        raise ReadResponse::Invalid, "missing saved state" unless row
      end
      folder_response(thread, mailbox, row)
    end

    def folder_response(thread, mailbox, row)
      response(envelope(thread, mailbox).merge("folder" => ThreadProjection.folder(row["folder"]),
        "snoozed_until" => ThreadProjection.timestamp(row["snoozed_until"]),
        "folder_version" => version(row, "folder_version"),
        "updated_at" => ThreadProjection.timestamp(row["updated_at"])))
    end
  end
end
