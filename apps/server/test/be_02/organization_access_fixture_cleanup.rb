# frozen_string_literal: true

# AIDEV-NOTE: Only these disposable organization fixtures may bypass the owner-loss trigger.
# Remove personal-owner references before the parent removes organization memberships.
module OrganizationAccessFixtureCleanup
  def teardown
    cleanup_error = nil
    begin
      cleanup_organization_access_fixture if @admin && @org && !@admin.finished?
    rescue StandardError => error
      cleanup_error = error
    end
    begin
      super
    rescue StandardError => error
      cleanup_error ||= error
    end
    raise cleanup_error if cleanup_error
  end

  private

  def cleanup_organization_access_fixture
    @admin.exec("ROLLBACK") unless @admin.transaction_status == PG::PQTRANS_IDLE
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
