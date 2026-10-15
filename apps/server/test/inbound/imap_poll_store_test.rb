# frozen_string_literal: true

require "minitest/autorun"
require "active_record"
require_relative "../../lib/elevateo/inbound/imap_poll_store"

class ImapPollStoreTest < Minitest::Test
  LEASE = { "account_id" => "11111111-1111-4111-8111-111111111111", "credential_version" => 1,
    "lease_token" => "22222222-2222-4222-8222-222222222222" }.freeze

  class Connection
    attr_reader :queries
    def initialize(reply) = (@reply, @queries = reply, [])
    def exec_query(sql, _, binds)
      @queries << [sql, binds.map(&:value_for_database)]
      @reply
    end
  end

  def test_empty_queue_and_strict_lease_identity
    store = Elevateo::Inbound::ImapPollStore
    assert_nil store.new(connection: Connection.new([{ "result" => nil }])).claim_next
    connection = Connection.new([{ "result" => JSON.generate(LEASE) }])
    lease = store.new(connection: connection).claim_next
    assert_equal LEASE, lease
    assert lease.frozen?
    assert_equal [["SELECT app.lease_due_imap_account()::text AS result", []]], connection.queries
  end

  def test_malformed_or_overbroad_claims_fail_closed
    bad = [[], [{}], [{ "result" => false }], [{ "result" => "{" }]]
    [nil, [], {}, LEASE.merge("scope" => "extra"), LEASE.merge("account_id" => nil),
     LEASE.merge("account_id" => "invalid"), LEASE.merge("lease_token" => nil),
     LEASE.merge("lease_token" => "invalid"), LEASE.merge("credential_version" => 0),
     LEASE.merge("credential_version" => -1), LEASE.merge("credential_version" => "1"),
     LEASE.merge("credential_version" => 1.5)].each { |value| bad << [{ "result" => JSON.generate(value) }] }
    bad.each do |reply|
      error = assert_raises(Elevateo::Inbound::Rejected) do
        Elevateo::Inbound::ImapPollStore.new(connection: Connection.new(reply)).claim_next
      end
      assert_equal "poll_unavailable", error.code
    end
  end

  def test_finish_binds_identity_and_accepts_only_actual_success
    %w[success full failure].each do |outcome|
      connection = Connection.new([{ "result" => true }])
      assert_nil Elevateo::Inbound::ImapPollStore.new(connection: connection).finish(LEASE, outcome: outcome)
      assert_equal [LEASE.fetch("account_id"), "1", LEASE.fetch("lease_token"), outcome], connection.queries.first.last
      assert_equal "SELECT app.finish_imap_poll($1::uuid,$2::integer,$3::uuid,$4::text) AS result", connection.queries.first.first
    end
    [[], [{}], [{ "result" => "true" }], [{ "result" => false }]].each do |reply|
      assert_raises(Elevateo::Inbound::Rejected) do
        Elevateo::Inbound::ImapPollStore.new(connection: Connection.new(reply)).finish(LEASE, outcome: "success")
      end
    end
    connection = Connection.new([])
    [nil, "", "retry", 1].each do |outcome|
      assert_raises(ArgumentError) { Elevateo::Inbound::ImapPollStore.new(connection: connection).finish(LEASE, outcome: outcome) }
    end
    assert_empty connection.queries
  end
end
