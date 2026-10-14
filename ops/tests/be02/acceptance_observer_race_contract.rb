# frozen_string_literal: true

require_relative "acceptance_observer"

module Be02Acceptance
  class ObserverRaceContract
    def self.verify(admin:, observer:, binding:)
      target = SecureRandom.uuid
      sentinel = binding.fetch("sentinel_draft_id")
      nonce = binding.fetch("nonce")
      policy = PG::Connection.quote_ident("#{binding.fetch('role')}_race_test")
      ddl = PG.connect(admin.conninfo_hash)
      ddl.set_notice_processor { |_notice| nil }
      ddl.exec("SET statement_timeout='3000'; SET lock_timeout='150'")
      inserted = admin.exec_params(<<~SQL, [target, sentinel])
        INSERT INTO app.drafts(id,organization_id,mailbox_id,actor_id,subject,recipients,body_text,version,state)
        SELECT $1,organization_id,mailbox_id,actor_id,'','[]'::jsonb,'',1,'editable'
        FROM app.drafts WHERE id=$2
      SQL
      raise "race_target_insert_failed" unless inserted.cmd_tuples == 1
      target_created = true
      request = { draft_id: target, operation_id: nil, nonce: nonce }
      raise "race_target_not_visible" unless observer.observe(**request).fetch("drafts").map { |row| row.fetch("id") } == [target]
      %w[app.drafts app_drafts_private.operations].each do |table|
        granted = admin.exec_params("SELECT has_table_privilege($1,$2,'SELECT')", [binding.fetch("role"), table])
        raise "race_requires_column_only_grants" unless granted.getvalue(0, 0) == "f"
      end
      original = observer.method(:verify_principal)
      %w[app.drafts app_drafts_private.operations].each do |table|
        column = table == "app.drafts" ? "id" : "draft_id"
        %w[SELECT ALL].each do |command|
          ["PUBLIC", PG::Connection.quote_ident(binding.fetch("role"))].each do |recipient|
            create = "CREATE POLICY #{policy} ON #{table} AS RESTRICTIVE FOR #{command} " \
              "TO #{recipient} USING (#{column}=#{admin.escape_literal(sentinel)}::uuid)"
            # AIDEV-NOTE: Pause the real observer after attestation; a second backend attempts real policy DDL.
            observer.define_singleton_method(:verify_principal) do |db|
              original.call(db)
              ObserverContract.expect_rejection(PG::LockNotAvailable) { ddl.exec(create) }
            end
            result = observer.observe(**request)
            raise "race_false_absence" unless result.fetch("drafts").map { |row| row.fetch("id") } == [target]
            observer.singleton_class.remove_method(:verify_principal)
            # Completion proves observation released its locks; the next preflight must reject the new policy.
            ddl.exec(create)
            ObserverContract.expect_rejection(RuntimeError, message: "observer_unexpected_restriction") do
              observer.observe(**request)
            end
            ddl.exec("DROP POLICY #{policy} ON #{table}")
          end
        end
      end
    ensure
      if original && observer.singleton_class.instance_methods(false).include?(:verify_principal)
        observer.singleton_class.remove_method(:verify_principal)
      end
      ddl&.close
      %w[app.drafts app_drafts_private.operations].each do |table|
        admin.exec("DROP POLICY IF EXISTS #{policy} ON #{table}") if policy
      end
      admin.exec_params("DELETE FROM app.drafts WHERE id=$1", [target]) if target_created
    end
  end
end
