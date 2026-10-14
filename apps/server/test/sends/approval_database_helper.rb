# frozen_string_literal: true

require_relative "../be_02/draft_database_test_helper"
require "digest"

# AIDEV-NOTE: Each fixture owns a disposable database; teardown removes only fixture rows with exact organization IDs.
class SendDatabaseTestCase < DraftDatabaseTestCase
  def setup
    super
    @epoch = SecureRandom.uuid
    fixture_change do
      @admin.exec_params("UPDATE app.mailbox_memberships SET approve_send = true WHERE mailbox_id = $1 AND user_id = $2", [@box, @user])
      @admin.exec_params("INSERT INTO app_send_private.organization_policy VALUES ($1, 1, clock_timestamp())", [@org])
      @admin.exec_params("INSERT INTO app_send_private.mailbox_policy VALUES ($1, $2, true)", [@org, @box])
    end
    @saved = payload(subject: "Review / \u2028", body_text: "line\nnext", to: [{ "display_name" => nil, "address" => "Recipient@EXAMPLE.invalid" }])
    assert_equal 1, save(@saved).fetch("version")
    @bytes = snapshot
    @review_digest = Digest::SHA256.hexdigest(@bytes)
  end

  def teardown
    if @admin && @org
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      # AIDEV-NOTE: Admin-only fixture disposal; production down refuses history and runtime roles cannot disable triggers.
      @admin.exec("BEGIN")
      @admin.exec("SET LOCAL session_replication_role = replica")
      %w[audit_events observations attempts jobs approval_operations intents recipient_suppressions mailbox_policy organization_policy].each do |table|
        predicate = %w[observations attempts jobs audit_events].include?(table) ?
          "send_id IN (SELECT send_id FROM app_send_private.intents WHERE organization_id = $1)" : "organization_id = $1"
        predicate = "attempt_id IN (SELECT attempt_id FROM app_send_private.attempts WHERE send_id IN (SELECT send_id FROM app_send_private.intents WHERE organization_id = $1))" if table == "observations"
        @admin.exec_params("DELETE FROM app_send_private.#{table} WHERE #{predicate}", [@org])
      end
      @admin.exec("COMMIT")
    end
    super
  end

  def snapshot(version: 1, subject: @saved.subject, recipients: [[nil, "Recipient@example.invalid"]], policy: "1")
    JSON.generate(["elevateo.send.snapshot.v1", @org, @box, @draft, version,
                   [nil, "#{@box}@example.invalid"], recipients, subject, @saved.body_text, nil,
                   "correspondence", "human_correspondence_attestation", [], policy])
  end

  def approve_sql(connection: @api, operation: @operation, version: 1, review_digest: @review_digest, bytes: @bytes, epoch: @epoch)
    encoded = bytes.nil? ? nil : bytes.unpack1("H*")
    JSON.parse(connection.exec_params(<<~SQL, [@digest, @box, @draft, operation, version, review_digest, encoded, epoch]).getvalue(0, 0))
      SELECT app.approve_draft_send($1::text,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::text,decode($7::text,'hex'),$8::uuid)
    SQL
  end

  def approve(connection: @api, **options)
    begin_write(connection: connection)
    assert_equal "ok", write_guard(connection: connection).fetch("status")
    result = approve_sql(connection: connection, **options)
    connection.exec("COMMIT")
    result
  ensure
    connection.exec("ROLLBACK") if connection.transaction_status != PG::PQTRANS_IDLE
  end

  def counts
    %w[intents jobs audit_events approval_operations].map do |table|
      Integer(@admin.exec("SELECT count(*) FROM app_send_private.#{table}").getvalue(0, 0), 10)
    end
  end

  def review
    begin_write
    JSON.parse(@api.exec_params("SELECT app.send_review($1::uuid,$2::uuid)", [@box, @draft]).getvalue(0, 0))
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end

  def status(send_id, epoch: @epoch)
    begin_write
    JSON.parse(@api.exec_params("SELECT app.send_status($1::uuid,$2::uuid,$3::uuid)", [@box, send_id, epoch]).getvalue(0, 0))
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end
end
