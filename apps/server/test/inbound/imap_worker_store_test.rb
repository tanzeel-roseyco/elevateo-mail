# frozen_string_literal: true

require "active_record"
require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_worker_store"

class ImapWorkerStoreTest < Minitest::Test
  class Connection
    attr_reader :queries
    def initialize(reply) = (@reply, @queries = reply, [])
    def exec_query(sql, _, binds)
      @queries << [sql, binds.map(&:value_for_database)]
      @reply
    end
  end

  def test_named_worker_function_receives_no_tenant_or_credential_secret
    connection = Connection.new([{ "result" => '{"result":"created"}' }])
    result = Elevateo::Inbound::ImapWorkerStore.new(connection: connection).insert_once(
      account_id: "11111111-1111-4111-8111-111111111111", credential_version: 1, uidvalidity: 42,
      uid: 7, content_sha256: "a" * 64, from: "sender@example.invalid", to: ["inbox@example.invalid"],
      subject: "hello", text: "body")
    assert_equal "created", result.fetch("result")
    assert_includes connection.queries.first.first, "app.ingest_imap_mail"
    assert_equal 9, connection.queries.first.last.length
    refute(connection.queries.first.last.any? { |value| value.to_s.include?("credential_ref") })
  end

  def test_changed_epoch_is_explicit_and_reset_uses_named_function
    connection = Connection.new([{ "result" => '{"result":"uidvalidity_changed"}' }])
    result = Elevateo::Inbound::ImapWorkerStore.new(connection: connection).insert_once(
      account_id: "11111111-1111-4111-8111-111111111111", credential_version: 1, uidvalidity: 43,
      uid: 1, content_sha256: "a" * 64, from: "sender@example.invalid", to: [], subject: "", text: "")
    assert_equal "uidvalidity_changed", result.fetch("result")
    reset = Connection.new([{ "result" => true }])
    assert Elevateo::Inbound::ImapWorkerStore.new(connection: reset).reset_uidvalidity(
      account_id: "11111111-1111-4111-8111-111111111111", credential_version: 1, expected: 42, replacement: 43)
    assert_includes reset.queries.first.first, "app.reset_imap_uidvalidity"
  end

  def test_attachment_path_uses_additive_worker_function
    connection = Connection.new([{ "result" => '{"result":"created"}' }])
    handle = { ordinal: 0, storage_key: "quarantine/imap/11111111-1111-4111-8111-111111111111/42/7/0",
      filename: "report.pdf", content_type: "application/pdf", byte_size: 4, sha256: "a" * 64 }
    Elevateo::Inbound::ImapWorkerStore.new(connection: connection).insert_once(
      account_id: "11111111-1111-4111-8111-111111111111", credential_version: 1, uidvalidity: 42,
      uid: 7, content_sha256: "b" * 64, from: "sender@example.invalid", to: ["inbox@example.invalid"],
      subject: "hello", text: "body", attachments: [handle])
    assert_includes connection.queries.first.first, "app.ingest_imap_mail_with_attachments"
    assert_equal 10, connection.queries.first.last.length
  end
  def test_lease_token_is_copied_and_binds_claim_reset_and_both_ingest_paths
    token = +"22222222-2222-4222-8222-222222222222"
    account = "11111111-1111-4111-8111-111111111111"
    claim = { account_id: account, organization_id: account, mailbox_id: account,
      credential_ref: "test:synthetic", credential_version: 1, uidvalidity: 42, last_uid: 0 }
    connection = Connection.new([{ "result" => JSON.generate(claim) }])
    store = Elevateo::Inbound::ImapWorkerStore.new(connection: connection, lease_token: token)
    token.replace("changed")
    store.claim(account_id: account, credential_version: 1)
    assert_includes connection.queries.first.first, "app.leased_claim_imap_account($1::uuid,$2::integer,$3::uuid)"
    assert_equal "22222222-2222-4222-8222-222222222222", connection.queries.first.last.last
    [false, true].each do |attachments|
      connection = Connection.new([{ "result" => '{"result":"created"}' }])
      store = Elevateo::Inbound::ImapWorkerStore.new(connection: connection, lease_token: account)
      values = { account_id: account, credential_version: 1, uidvalidity: 42, uid: 7,
        content_sha256: "a" * 64, from: "sender@example.invalid", to: [], subject: "", text: "" }
      values[:attachments] = [{ ordinal: 0, storage_key: "key", filename: "a.txt", content_type: "text/plain",
        byte_size: 1, sha256: "a" * 64 }] if attachments
      store.insert_once(**values)
      sql, binds = connection.queries.first
      assert_includes sql, attachments ? "app.leased_ingest_imap_mail_with_attachments" : "app.leased_ingest_imap_mail("
      assert_includes sql, attachments ? "$11::uuid)" : "$10::uuid)"
      assert_equal account, binds.last
      assert_equal attachments ? 11 : 10, binds.length
    end
    connection = Connection.new([{ "result" => true }])
    store = Elevateo::Inbound::ImapWorkerStore.new(connection: connection, lease_token: account)
    assert store.reset_uidvalidity(account_id: account, credential_version: 1, expected: 42, replacement: 43)
    assert_includes connection.queries.first.first, "app.leased_reset_imap_uidvalidity"
    assert_includes connection.queries.first.first, "$5::uuid)"
    assert_equal [account, "1", "42", "43", account], connection.queries.first.last
  end

  def test_malformed_lease_is_rejected_before_query
    connection = Connection.new([])
    ["", "bad", 1, false].each do |token|
      assert_raises(ArgumentError) { Elevateo::Inbound::ImapWorkerStore.new(connection: connection, lease_token: token) }
    end
    assert_empty connection.queries
  end

end
