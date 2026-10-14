# frozen_string_literal: true

require_relative "acceptance_observer"
require "securerandom"

module Be02Acceptance
  # AIDEV-NOTE: Call only in a disposable CI cluster; role-specific literal policies cannot widen via client GUCs.
  class ObserverRole
    def self.create(db, organization_id:, mailbox_id:, actor_id:, sentinel_draft_id:, disposable_nonce:, password:)
      raise ArgumentError, "observer_secret_invalid" unless password.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(password)
      ids = [organization_id, mailbox_id, actor_id, sentinel_draft_id]
      raise ArgumentError, "observer_scope_invalid" unless ids.all? { |id| id.is_a?(String) && Observer::UUID.match?(id) } &&
        disposable_nonce.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(disposable_nonce)
      # The scheduler issues this marker only for its exact isolated CI database, never either persistent stack.
      marker = db.exec("SELECT current_setting('qa404.disposable_nonce',true)").getvalue(0, 0)
      raise "disposable_ci_required" unless marker == disposable_nonce
      role = "qa404_#{SecureRandom.hex(16)}"
      quoted_role = PG::Connection.quote_ident(role)
      predicate = "organization_id=#{db.escape_literal(organization_id)}::uuid AND " \
        "mailbox_id=#{db.escape_literal(mailbox_id)}::uuid AND actor_id=#{db.escape_literal(actor_id)}::uuid"
      db.transaction do
        db.exec("CREATE ROLE #{quoted_role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION " \
          "PASSWORD #{db.escape_literal(password)}")
        db.exec("COMMENT ON ROLE #{quoted_role} IS #{db.escape_literal("qa404-disposable:#{disposable_nonce}")}")
        db.exec("ALTER ROLE #{quoted_role} SET default_transaction_read_only=on")
        db.exec("GRANT USAGE ON SCHEMA app,app_drafts_private TO #{quoted_role}")
        db.exec("GRANT SELECT(id,organization_id,mailbox_id,actor_id,version,state) ON app.drafts TO #{quoted_role}")
        db.exec("GRANT SELECT(organization_id,mailbox_id,actor_id,draft_id,operation_id,detail) " \
          "ON app_drafts_private.operations TO #{quoted_role}")
        %w[app.drafts app_drafts_private.operations].each do |table|
          db.exec("CREATE POLICY #{quoted_role} ON #{table} FOR SELECT TO #{quoted_role} USING (#{predicate})")
        end
      end
      { "database_oid" => Integer(db.exec("SELECT oid FROM pg_database WHERE datname=current_database()").getvalue(0, 0)),
        "role" => role, "nonce" => disposable_nonce, "organization_id" => organization_id,
        "mailbox_id" => mailbox_id, "actor_id" => actor_id, "sentinel_draft_id" => sentinel_draft_id }
    end

    def self.drop(db, binding)
      role = binding.fetch("role")
      raise ArgumentError, "observer_role_invalid" unless /\Aqa404_[0-9a-f]{32}\z/.match?(role)
      description = db.exec_params("SELECT shobj_description(oid,'pg_authid') FROM pg_roles WHERE rolname=$1", [role])
      return if description.ntuples.zero?
      raise "observer_cleanup_binding_invalid" unless description.getvalue(0, 0) == "qa404-disposable:#{binding.fetch('nonce')}"
      quoted_role = PG::Connection.quote_ident(role)
      db.transaction do
        %w[app.drafts app_drafts_private.operations].each do |table|
          db.exec("DROP POLICY #{quoted_role} ON #{table}")
          db.exec("REVOKE ALL ON #{table} FROM #{quoted_role}")
        end
        db.exec("REVOKE USAGE ON SCHEMA app,app_drafts_private FROM #{quoted_role}")
        db.exec("DROP ROLE #{quoted_role}")
      end
    end
  end
end
