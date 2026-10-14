# frozen_string_literal: true

require_relative "acceptance_observer_role"

module Be02Acceptance
  # AIDEV-NOTE: Real PostgreSQL self-test; no fabricated operation receipt or browser acceptance PASS is generated.
  class ObserverContract
    def self.verify(admin:, scope:, connection_parameters:, foreign_draft_id:, applied_operation_id:)
      raise "foreign_positive_control_invalid" unless Observer::UUID.match?(foreign_draft_id.to_s) &&
        admin.exec_params("SELECT count(*) FROM app.drafts WHERE id=$1", [foreign_draft_id]).getvalue(0, 0) == "1"
      raise "actual_applied_operation_required" unless Observer::UUID.match?(applied_operation_id.to_s)
      applied = admin.exec_params(<<~SQL, [scope.fetch(:organization_id), scope.fetch(:mailbox_id), scope.fetch(:actor_id), scope.fetch(:sentinel_draft_id), applied_operation_id]).first
        SELECT operation_id::text, detail->>'outcome' AS outcome, detail->>'version' AS version
        FROM app_drafts_private.operations
        WHERE organization_id=$1 AND mailbox_id=$2 AND actor_id=$3 AND draft_id=$4 AND operation_id=$5
      SQL
      raise "actual_applied_operation_required" unless applied && applied.fetch("outcome") == "applied"
      applied["version"] = Integer(applied.fetch("version"), 10)
      password = SecureRandom.hex(32)
      binding = ObserverRole.create(admin, **scope, password: password)
      parameters = connection_parameters.merge(user: binding.fetch("role"), password: password)
      observer = Observer.new(parameters, binding)
      nonce = binding.fetch("nonce")
      sentinel = binding.fetch("sentinel_draft_id")
      visible = observer.observe(draft_id: sentinel, operation_id: nil, nonce: nonce)
      expected = admin.exec_params("SELECT id::text,version,state FROM app.drafts WHERE id=$1", [sentinel]).first
      expected["version"] = Integer(expected.fetch("version"), 10)
      raise "observer_positive_control_failed" unless visible == { "drafts" => [expected], "operations" => [] }
      receipt = observer.observe(draft_id: sentinel, operation_id: applied_operation_id, nonce: nonce)
      raise "observer_operation_visibility_failure" unless receipt == { "drafts" => [expected], "operations" => [applied] }
      hidden = observer.observe(draft_id: foreign_draft_id, operation_id: nil, nonce: nonce)
      raise "observer_scope_failure" unless hidden == { "drafts" => [], "operations" => [] }
      expect_rejection(ArgumentError) { observer.observe(draft_id: sentinel, operation_id: nil, nonce: (nonce.start_with?("0") ? "1" : "0") + nonce[1..]) }
      expect_rejection(ArgumentError) { observer.observe(draft_id: "invalid", operation_id: nil, nonce: nonce) }
      restricted = PG.connect(**parameters)
      restricted.set_notice_processor { |_notice| nil }
      # Independent column and RLS checks catch accidentally broad grants even when helper SQL stays narrow.
      %w[subject body_text recipients].each do |column|
        permission = restricted.exec_params("SELECT has_column_privilege(current_user,'app.drafts',$1,'SELECT')", [column])
        raise "observer_content_grant" unless permission.getvalue(0, 0) == "f"
      end
      permission = restricted.exec("SELECT has_column_privilege(current_user,'app_drafts_private.operations','payload_digest','SELECT')")
      raise "observer_digest_grant" unless permission.getvalue(0, 0) == "f"
      hidden = restricted.exec_params("SELECT id FROM app.drafts WHERE id=$1", [foreign_draft_id])
      raise "observer_direct_scope_failure" unless hidden.ntuples.zero?
      # Read-only defaults alone are insufficient: the role must also fail with a writable transaction.
      restricted.exec("BEGIN READ WRITE")
      expect_rejection(PG::InsufficientPrivilege) { restricted.exec_params("UPDATE app.drafts SET version=version WHERE id=$1", [sentinel]) }
      restricted.exec("ROLLBACK")
      restricted.exec("BEGIN READ WRITE")
      expect_rejection(PG::InsufficientPrivilege) { restricted.exec("DELETE FROM app_drafts_private.operations WHERE false") }
      restricted.exec("ROLLBACK")
      restricted.close
      restricted = nil
      ObserverRole.drop(admin, binding)
      raise "observer_role_cleanup_failed" unless admin.exec_params("SELECT 1 FROM pg_roles WHERE rolname=$1", [binding.fetch("role")]).ntuples.zero?
      binding = nil
      { "status" => "observed", "scope" => "observer_role_and_draft_visibility_only", "assertions" => 13 }
    ensure
      restricted&.close
      ObserverRole.drop(admin, binding) if binding
    end

    def self.expect_rejection(error_class)
      begin
        yield
      rescue error_class
        return
      end
      raise "observer_rejection_missing"
    end
  end
end
