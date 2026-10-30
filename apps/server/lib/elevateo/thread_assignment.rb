# frozen_string_literal: true

require_relative "thread_collaboration"

module Elevateo
  class ThreadAssignment < ThreadCollaboration
    REQUIRED = %w[mailbox_id assignee_id expected_assignment_version].freeze
    STATE_SQL = <<~SQL.freeze
      SELECT assignee_id, assignment_version,
             to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
        FROM app.thread_assignments
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND thread_id = $3::uuid
    SQL
    INITIAL_SQL = <<~SQL.freeze
      INSERT INTO app.thread_assignments(organization_id, mailbox_id, thread_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid) ON CONFLICT (organization_id, mailbox_id, thread_id) DO NOTHING
    SQL
    SAVE_SQL = <<~SQL.freeze
      UPDATE app.thread_assignments
         SET assignee_id = $4::uuid, assignment_version = assignment_version + 1, updated_at = clock_timestamp()
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND thread_id = $3::uuid
      RETURNING assignee_id, assignment_version,
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    SQL
    TARGET_SQL = "SELECT app_auth.collaboration_reader($1::text, $2::uuid, $3::uuid) AS eligible".freeze

    def self.validate!(input)
      keys!(input, REQUIRED)
      WriteInput.uuid(input["mailbox_id"])
      WriteInput.uuid(input["assignee_id"]) unless input["assignee_id"].nil?
      WriteInput.integer(input["expected_assignment_version"], minimum: 0, maximum: MAX_VERSION)
      nil
    end

    def get(thread_id:, query:)
      self.class.keys!(query, ["mailbox_id"])
      thread, mailbox = WriteInput.uuid(thread_id), WriteInput.uuid(query["mailbox_id"])
      resource!(thread, mailbox)
      row = rows(STATE_SQL, [@identity.org_id, mailbox, thread]).first || initial
      serialized(project(row, thread, mailbox))
    end

    def put(thread_id:, input:)
      self.class.validate!(input)
      thread, mailbox = WriteInput.uuid(thread_id), WriteInput.uuid(input["mailbox_id"])
      target = input["assignee_id"].nil? ? nil : WriteInput.uuid(input["assignee_id"])
      expected = WriteInput.integer(input["expected_assignment_version"], minimum: 0, maximum: MAX_VERSION)
      resource!(thread, mailbox)
      # AIDEV-NOTE: protected_write holds sorted actor/target guards; eligibility must precede the version comparison.
      if target && rows(TARGET_SQL, [@identity.digest, mailbox, target]).first&.fetch("eligible") != true
        raise CollaborationError.new("not_available")
      end
      values = [@identity.org_id, mailbox, thread]
      # The zero row makes the first CAS contend on the same row even for different acting users.
      rows(INITIAL_SQL, values)
      row = rows(STATE_SQL + " FOR UPDATE", values).first
      raise ReadResponse::Invalid, "missing assignment" unless row
      current = version(row, "assignment_version")
      raise CollaborationError.new("assignment_conflict") unless expected == current

      unless row["assignee_id"] == target
        advance!(current)
        row = rows(SAVE_SQL, values + [target]).first
        raise ReadResponse::Invalid, "missing saved assignment" unless row
      end
      response(project(row, thread, mailbox))
    end

    private

    def initial = { "assignee_id" => nil, "assignment_version" => 0, "updated_at" => nil }

    def project(row, thread, mailbox)
      assignee = row["assignee_id"]
      envelope(thread, mailbox).merge("assignee_id" => assignee.nil? ? nil : ThreadProjection.uuid(assignee),
        "assignment_version" => version(row, "assignment_version"),
        "updated_at" => ThreadProjection.timestamp(row["updated_at"]))
    end
  end
end
