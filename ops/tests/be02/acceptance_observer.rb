# frozen_string_literal: true

require "json"
require "digest"
require "pg"

module Be02Acceptance
  # AIDEV-NOTE: Runner-only fixed SQL; browser credentials, arbitrary SQL and message content never enter this channel.
  class Observer
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/
    KEYS = %w[database_oid role nonce organization_id mailbox_id actor_id sentinel_draft_id].freeze

    def initialize(connection_parameters, binding)
      raise ArgumentError, "observer_binding_invalid" unless binding.is_a?(Hash) && binding.keys.sort == KEYS.sort
      %w[organization_id mailbox_id actor_id sentinel_draft_id].each do |key|
        raise ArgumentError, "observer_binding_invalid" unless binding.fetch(key).is_a?(String) && UUID.match?(binding.fetch(key))
      end
      raise ArgumentError, "observer_binding_invalid" unless /\Aqa404_[0-9a-f]{32}\z/.match?(binding.fetch("role")) &&
        /\A[0-9a-f]{64}\z/.match?(binding.fetch("nonce")) && binding.fetch("database_oid").is_a?(Integer)
      @parameters, @binding = connection_parameters.dup.freeze, binding.dup.freeze
    end

    def observe(draft_id:, operation_id:, nonce:)
      raise ArgumentError, "observer_request_invalid" unless UUID.match?(draft_id.to_s) &&
        (operation_id.nil? || UUID.match?(operation_id.to_s)) && nonce == @binding.fetch("nonce")
      db = PG.connect(**@parameters)
      db.set_notice_processor { |_notice| nil }
      db.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      db.exec("SET LOCAL statement_timeout='3000'; SET LOCAL lock_timeout='1000'")
      verify_principal(db)
      # Positive visibility is required in each new snapshot before absence can be evidence.
      raise "observer_visibility_error" unless draft(db, @binding.fetch("sentinel_draft_id")).length == 1
      drafts = draft(db, draft_id)
      operations = operation_id ? operation(db, draft_id, operation_id) : []
      drafts.each { |row| row["version"] = version(row.fetch("version"), 1) }
      operations.each do |row|
        raise "observer_outcome_invalid" unless %w[applied conflict expired].include?(row.fetch("outcome"))
        row["version"] = version(row.fetch("version"), 0) unless row.fetch("version").nil?
      end
      db.exec("COMMIT")
      { "drafts" => drafts, "operations" => operations }
    ensure
      db&.close
    end

    private

    def verify_principal(db)
      row = db.exec(<<~SQL).first
        SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication,
          shobj_description(r.oid,'pg_authid') AS binding,
          (SELECT oid FROM pg_database WHERE datname=current_database()) AS database_oid,
          EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS memberships
        FROM pg_roles r WHERE rolname=session_user AND session_user=current_user
      SQL
      expected = "qa404-disposable:#{@binding.fetch('nonce')}"
      raise "observer_role_invalid" unless row && row.fetch("rolname") == @binding.fetch("role") &&
        row.fetch("binding") == expected && Integer(row.fetch("database_oid")) == @binding.fetch("database_oid") &&
        %w[rolsuper rolbypassrls rolcreaterole rolcreatedb rolreplication memberships].all? { |key| row.fetch(key) == "f" }
      %w[app.drafts app_drafts_private.operations].each do |table|
        writable = db.exec_params("SELECT has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,$1,'INSERT,UPDATE,REFERENCES')", [table])
        raise "observer_role_writable" unless writable.getvalue(0, 0) == "f"
      end
    end

    def version(value, minimum)
      number = Integer(value, 10)
      raise "observer_version_invalid" unless (minimum..2_147_483_647).cover?(number)
      number
    end

    def scope = @binding.values_at("organization_id", "mailbox_id", "actor_id")

    def draft(db, id)
      db.exec_params(<<~SQL, scope + [id]).to_a
        SELECT id::text, version, state FROM app.drafts
        WHERE organization_id=$1 AND mailbox_id=$2 AND actor_id=$3 AND id=$4
      SQL
    end

    def operation(db, draft_id, operation_id)
      db.exec_params(<<~SQL, scope + [draft_id, operation_id]).to_a
        SELECT operation_id::text, CASE WHEN detail IS NULL THEN 'expired' ELSE detail->>'outcome' END AS outcome,
          COALESCE(detail->>'version',detail->>'current_version') AS version
        FROM app_drafts_private.operations
        WHERE organization_id=$1 AND mailbox_id=$2 AND actor_id=$3 AND draft_id=$4 AND operation_id=$5
      SQL
    end
  end
end
