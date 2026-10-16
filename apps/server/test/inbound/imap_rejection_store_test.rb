# frozen_string_literal: true

require "active_record"
require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_worker_store"

class ImapRejectionStoreTest < Minitest::Test
  # AIDEV-NOTE: Inspect the exact named SQL call without importing executable tests from another suite.
  class Connection
    attr_reader :queries
    def initialize(reply) = (@reply, @queries = reply, [])
    def exec_query(sql, _, binds)
      @queries << [sql, binds.map(&:value_for_database)]
      @reply
    end
  end
  ACCOUNT = "11111111-1111-4111-8111-111111111111"
  TOKEN = "22222222-2222-4222-8222-222222222222"
  def reject_with(connection, token: TOKEN)
    Elevateo::Inbound::ImapWorkerStore.new(connection: connection, lease_token: token).reject_once(
      account_id: ACCOUNT, credential_version: 1, uidvalidity: 42, uid: 7,
      content_sha256: "a" * 64, reason: "invalid_mime")
  end

  def test_rejection_carries_only_evidence_and_lease_through_named_function
    connection = Connection.new([{ "result" => '{"result":"rejected"}' }])
    assert_equal "rejected", reject_with(connection).fetch("result")
    sql, values = connection.queries.first
    assert_includes sql, "app.leased_reject_imap_mail($1::uuid,$2::integer,$3::bigint,$4::bigint,$5::text,$6::text,$7::uuid)"
    assert_equal [ACCOUNT, "1", "42", "7", "a" * 64, "invalid_mime", TOKEN], values
  end

  def test_unleased_rejection_never_queries
    connection = Connection.new([])
    assert_equal "lease_unavailable", assert_raises(Elevateo::Inbound::Rejected) { reject_with(connection, token: nil) }.code
    assert_empty connection.queries
  end

  def test_invalid_store_results_cannot_advance_sync
    [[], [{}], [{ "result" => nil }], [{ "result" => 7 }], [{ "result" => "broken" }], [{ "result" => "[]" }],
      [{ "result" => '{"result":"created"}' }]].each do |reply|
      connection = Connection.new(reply)
      assert_equal "store_unavailable", assert_raises(Elevateo::Inbound::Rejected) { reject_with(connection) }.code
    end
    %w[duplicate_rejection uidvalidity_changed].each do |result|
      connection = Connection.new([{ "result" => JSON.generate(result: result) }])
      assert_equal result, reject_with(connection).fetch("result")
    end
  end
end
