# frozen_string_literal: true

require "minitest/autorun"
require "pg"
require "securerandom"

# AIDEV-NOTE: Soren runs this only after 00015 in an exclusive disposable fleet database.
class AttachmentDatabaseTest < Minitest::Test
  def setup
    @admin = connect("ATT823_ADMIN_DATABASE_URL", "supabase_admin")
    @migrator = connect("ATT823_MIGRATOR_DATABASE_URL", "elevateo_migrator")
    @api = connect("ATT823_API_DATABASE_URL", "elevateo_api")
    @worker = connect("ATT823_WORKER_DATABASE_URL", "elevateo_worker")
    @org, @user, @box, @thread, @message, @attachment, @source_account = Array.new(7) { SecureRandom.uuid }
    @admin.exec_params("INSERT INTO app.organizations(id,name) VALUES ($1,'ATT823 disposable')", [@org])
    @admin.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@org, @user])
    @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ($1,$2,$3,'shared')",
      [@box, @org, "#{@box}@example.invalid"])
    @admin.exec_params("INSERT INTO app.threads(id,organization_id,mailbox_id) VALUES ($1,$2,$3)", [@thread, @org, @box])
    @admin.exec_params("INSERT INTO app.messages(id,organization_id,mailbox_id,thread_id) VALUES ($1,$2,$3,$4)",
      [@message, @org, @box, @thread])
    @migrator.exec("SET ROLE elevateo_owner")
    assert_equal "elevateo_owner", @migrator.exec("SELECT current_user").getvalue(0, 0)
    @wrapper = "att823_test_bind_#{SecureRandom.hex(6)}"
    @migrator.exec(<<~SQL)
      CREATE FUNCTION app.#{@wrapper}(p_id uuid,p_sha text,p_reason text) RETURNS uuid
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
        SELECT app.bind_imported_inbox_attachment(p_id,'#{@org}'::uuid,'#{@box}'::uuid,
          '#{@thread}'::uuid,'#{@message}'::uuid,'#{@source_account}'::uuid,1,2,0,
          CASE WHEN p_reason IS NULL THEN 'quarantine/imap/#{@source_account}/1/2/0' ELSE NULL END,
          'fixture.txt','text/plain',CASE WHEN p_reason IS NULL THEN 4 ELSE 0 END,p_sha,p_reason)
      $$;
      REVOKE ALL ON FUNCTION app.#{@wrapper}(uuid,text,text) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION app.#{@wrapper}(uuid,text,text) TO elevateo_worker;
    SQL
  end

  def teardown
    @migrator&.exec("DROP FUNCTION IF EXISTS app.#{@wrapper}(uuid,text,text)") if @wrapper
    @admin&.exec_params("DELETE FROM app.organizations WHERE id=$1", [@org]) if @org
  ensure
    [@worker, @api, @migrator, @admin].compact.each { |connection| connection.close unless connection.finished? }
  end

  def connect(key, expected)
    database = ENV.fetch("ATT823_TASK_DATABASE_NAME")
    raise "task database name required" if database.empty?
    connection = PG.connect(ENV.fetch(key))
    row = connection.exec("SELECT session_user,current_database()").first
    raise "wrong disposable role/database" unless row.values_at("session_user", "current_database") == [expected, database]
    connection.exec("SET statement_timeout='3s'; SET lock_timeout='1s'")
    connection
  end

  def insert_pending
    key = "quarantine/#{@org}/#{@attachment}"
    @migrator.exec_params(<<~SQL, [@attachment, @org, @box, @thread, @message, key])
      INSERT INTO app.inbox_attachments(id,organization_id,mailbox_id,thread_id,message_id,
        storage_key,filename,content_type,byte_size,sha256,scan_status)
      VALUES ($1,$2,$3,$4,$5,$6,'fixture.txt','text/plain',4,repeat('a',64),'pending_scan')
    SQL
  end

  def import(id: SecureRandom.uuid, sha: "a" * 64, reason: nil)
    @worker.exec_params("SELECT app.#{@wrapper}($1::uuid,$2,$3)", [id, sha, reason]).getvalue(0, 0)
  end

  def test_owner_definer_policy_allows_bound_insert_and_worker_fenced_scan
    insert_pending
    assert_equal "1", @migrator.exec_params("SELECT count(id) FROM app.inbox_attachments WHERE id=$1", [@attachment]).getvalue(0, 0)
    token = SecureRandom.uuid
    claim = @worker.exec_params("SELECT * FROM app.claim_inbox_attachment_scan($1::uuid,$2::uuid)", [@attachment, token]).first
    assert_equal "1", claim.fetch("scan_attempt")
    assert_equal "t", @worker.exec_params("SELECT app.record_inbox_attachment_scan($1::uuid,$2,$3::uuid,$4::integer,$5)",
      [@attachment, "a" * 64, token, 1, "scan_failed"]).getvalue(0, 0)
    assert_equal "f", @worker.exec_params("SELECT app.record_inbox_attachment_scan($1::uuid,$2,$3::uuid,$4::integer,$5)",
      [@attachment, "a" * 64, token, 1, "clean"]).getvalue(0, 0)
    assert_equal "scan_failed", @migrator.exec_params("SELECT scan_status FROM app.inbox_attachments WHERE id=$1", [@attachment]).getvalue(0, 0)
  end

  def test_concurrent_same_source_replays_one_id_and_changed_digest_conflicts
    other = connect("ATT823_WORKER_DATABASE_URL", "elevateo_worker")
    ids = Array.new(2) { SecureRandom.uuid }
    gate = Queue.new
    calls = [@worker, other].each_with_index.map do |connection, index|
      Thread.new do
        gate.pop
        connection.exec_params("SELECT app.#{@wrapper}($1::uuid,$2,$3)", [ids.fetch(index), "a" * 64, nil]).getvalue(0, 0)
      end
    end
    2.times { gate << true }
    results = calls.map(&:value)
    assert_equal 1, results.uniq.length
    assert_includes ids, results.first
    assert_equal "1", @migrator.exec_params("SELECT count(id) FROM app.inbox_attachments WHERE source_account_id=$1", [@source_account]).getvalue(0, 0)
    assert_raises(PG::UniqueViolation) do
      import(sha: "b" * 64)
    end
  ensure
    other&.close unless other&.finished?
  end

  def test_identical_replay_after_clean_preserves_canonical_id_and_verdict
    assert_terminal_replay("clean")
  end

  def test_identical_replay_after_malware_preserves_canonical_id_and_verdict
    assert_terminal_replay("malware")
  end

  def test_identical_replay_after_rejection_preserves_canonical_id_and_verdict
    original = import(id: @attachment, sha: nil, reason: "invalid_signature")
    assert_equal @attachment, original
    assert_equal original, import(sha: nil, reason: "invalid_signature")
    assert_equal "rejected", @migrator.exec_params("SELECT scan_status FROM app.inbox_attachments WHERE id=$1", [original]).getvalue(0, 0)
    assert_equal "1", @migrator.exec_params("SELECT count(id) FROM app.inbox_attachments WHERE source_account_id=$1", [@source_account]).getvalue(0, 0)
  end

  def assert_terminal_replay(verdict)
    original = import(id: @attachment)
    token = SecureRandom.uuid
    claim = @worker.exec_params("SELECT * FROM app.claim_inbox_attachment_scan($1::uuid,$2::uuid)", [original, token]).first
    assert_equal "1", claim.fetch("scan_attempt")
    assert_equal "t", @worker.exec_params("SELECT app.record_inbox_attachment_scan($1::uuid,$2,$3::uuid,$4::integer,$5)",
      [original, "a" * 64, token, 1, verdict]).getvalue(0, 0)
    assert_equal original, import
    assert_equal verdict, @migrator.exec_params("SELECT scan_status FROM app.inbox_attachments WHERE id=$1", [original]).getvalue(0, 0)
    assert_equal "1", @migrator.exec_params("SELECT count(id) FROM app.inbox_attachments WHERE source_account_id=$1", [@source_account]).getvalue(0, 0)
  end

  def test_direct_api_and_worker_table_writes_denied
    insert_pending
    assert_equal "f", @admin.exec("SELECT has_table_privilege('elevateo_api','app.inbox_attachments','INSERT')").getvalue(0, 0)
    assert_equal "f", @admin.exec("SELECT has_table_privilege('elevateo_worker','app.inbox_attachments','UPDATE')").getvalue(0, 0)
    assert_equal "f", @admin.exec("SELECT has_function_privilege('elevateo_worker',
      'app.bind_imported_inbox_attachment(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,integer,text,text,text,integer,text,text)','EXECUTE')").getvalue(0, 0)
    %w[storage_key sha256].each do |column|
      assert_equal "f", @admin.exec_params("SELECT has_column_privilege('elevateo_api', 'app.inbox_attachments', $1, 'SELECT')", [column]).getvalue(0, 0)
      assert_equal "f", @admin.exec_params("SELECT has_column_privilege('elevateo_app_read', 'app.inbox_attachments', $1, 'SELECT')", [column]).getvalue(0, 0)
      assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT #{column} FROM app.inbox_attachments LIMIT 1") }
    end
    assert_equal "0", @api.exec_params("SELECT count(id) FROM app.inbox_attachments WHERE id=$1", [@attachment]).getvalue(0, 0)
  end
end
