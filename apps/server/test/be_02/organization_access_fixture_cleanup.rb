# frozen_string_literal: true

# AIDEV-NOTE: Only these disposable organization fixtures may bypass the owner-loss trigger.
# Remove personal-owner references before the parent removes organization memberships.
module OrganizationAccessFixtureCleanup
  def teardown
    cleanup_error = nil
    begin
      restore_fixture_connections
      rollback_fixture_connection(@api)
      rollback_fixture_connection(@admin)
    rescue StandardError => error
      cleanup_error = error
    end
    unless cleanup_error
      begin
        prepare_organization_fixture_cleanup if respond_to?(:prepare_organization_fixture_cleanup, true)
      rescue StandardError => error
        cleanup_error = error
      end
      begin
        rollback_fixture_connection(@admin)
        cleanup_organization_access_fixture if @admin && @org
      rescue StandardError => error
        cleanup_error ||= error
      end
    end
    begin
      super
    rescue StandardError => error
      cleanup_error ||= error
    end
    raise cleanup_error if cleanup_error
  end

  private

  def restore_fixture_connections
    if @admin&.finished?
      replacement = connect("BE02_ADMIN_DATABASE_URL", "supabase_admin")
      unless replacement.exec_params("SELECT pg_try_advisory_lock($1::bigint)", [SessionDatabaseTestCase::FIXTURE_LOCK]).getvalue(0, 0) == "t"
        replacement.finish
        raise "database fixture ownership lost during cleanup"
      end
      @admin = replacement
    end
    @api = connect("BE02_API_DATABASE_URL", "elevateo_api") if @api&.finished?
  end

  def rollback_fixture_connection(connection)
    return unless connection && !connection.finished?

    connection.exec("ROLLBACK") unless connection.transaction_status == PG::PQTRANS_IDLE
  end

  def cleanup_organization_access_fixture
    @admin.exec("BEGIN")
    @admin.exec_params("DELETE FROM app.mailbox_security WHERE organization_id = $1", [@org])
    @admin.exec_params("DELETE FROM app.organization_enrollment_receipts WHERE organization_id = $1", [@org])
    @admin.exec("ALTER TABLE app.organization_access DISABLE TRIGGER guard_owner_loss")
    @admin.exec_params("DELETE FROM app.organization_access WHERE organization_id = $1", [@org])
    @admin.exec("ALTER TABLE app.organization_access ENABLE TRIGGER guard_owner_loss")
    @admin.exec("COMMIT")
  rescue StandardError
    @admin.exec("ROLLBACK") if !@admin.finished? && @admin.transaction_status != PG::PQTRANS_IDLE
    raise
  end
end
