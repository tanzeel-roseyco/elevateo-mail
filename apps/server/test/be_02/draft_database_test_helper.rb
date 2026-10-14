# frozen_string_literal: true

require_relative "write_boundary_database_test_helper"
require_relative "organization_access_fixture_cleanup"
require_relative "../../lib/elevateo/drafts/payload"

# AIDEV-NOTE: Production SQL is exercised with actual API/worker logins; only fixture setup has admin authority.
class DraftDatabaseTestCase < WriteBoundaryDatabaseTestCase
  include OrganizationAccessFixtureCleanup

  def setup
    super
    @box, @draft, @operation = Array.new(3) { SecureRandom.uuid }
    fixture_change do
      @admin.exec_params("INSERT INTO app.mailboxes(id, organization_id, address, visibility) VALUES ($1, $2, $3, 'private')", [@box, @org, "#{@box}@example.invalid"])
      @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id, mailbox_id, user_id, compose) VALUES ($1, $2, $3, true)", [@org, @box, @user])
      # AIDEV-NOTE: The legacy draft revocation fixture now states its SEC802 authority explicitly.
      @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'owner')", [@org, @user])
      @admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification) VALUES ($1,$2,'team')", [@org, @box])
      @admin.exec_params(<<~SQL, [@org, @box, @user])
        INSERT INTO app.mailbox_grant_ceilings(organization_id,mailbox_id,user_id,compose,manage_members)
          VALUES ($1,$2,$3,true,true)
      SQL
    end
  end

  def teardown
    @api.exec("ROLLBACK") if @api && @api.transaction_status != PG::PQTRANS_IDLE
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    @admin.exec_params("DELETE FROM app_drafts_private.operations WHERE organization_id = $1", [@org]) if @admin && @org
    super
  end

  def fixture_change
    # AIDEV-NOTE: Administrative setup only; revocation races must use separate API sessions and production guards.
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE organization_id = $1 ORDER BY cookie_digest FOR UPDATE", [@org])
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, NULL)", [@org])
    yield
    @admin.exec("COMMIT")
  rescue StandardError
    @admin.exec("ROLLBACK")
    raise
  end

  def payload(changes = {}, draft: @draft, **fields)
    Elevateo::Drafts::Payload.new(draft_id: draft, input: {
      "mailbox_id" => @box, "operation_id" => @operation, "expected_version" => 0,
      "subject" => "", "to" => [], "body_text" => "", "reply_to_thread_id" => nil
    }.merge(changes).merge(fields.transform_keys(&:to_s)))
  end

  def save_sql(value, connection: @api, digest: @digest)
    values = [digest, value.mailbox_id, value.draft_id, value.operation_id, value.digest,
      value.expected_version, value.subject, JSON.generate(value.recipients), value.body_text, value.reply_id]
    JSON.parse(connection.exec_params(<<~SQL, values).getvalue(0, 0))
      SELECT app.save_draft($1::text, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::integer,
        $7::text, $8::jsonb, $9::text, $10::uuid)
    SQL
  end

  def save(value = payload, connection: @api, digest: @digest)
    begin_write(connection: connection)
    assert_equal "ok", write_guard(connection: connection, digest: digest).fetch("status")
    result = save_sql(value, connection: connection, digest: digest)
    connection.exec("COMMIT")
    result
  ensure
    connection.exec("ROLLBACK") if connection.transaction_status != PG::PQTRANS_IDLE
  end

  def lookup(operation: @operation, box: @box, draft: @draft)
    begin_write
    JSON.parse(@api.exec_params("SELECT app.draft_operation($1::uuid, $2::uuid, $3::uuid)", [box, draft, operation]).getvalue(0, 0))
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end

  def ledger
    @admin.exec_params("SELECT * FROM app_drafts_private.operations WHERE organization_id = $1 ORDER BY operation_id", [@org]).to_a
  end

  def draft_row
    @admin.exec_params("SELECT * FROM app.drafts WHERE id = $1", [@draft]).first
  end
end
