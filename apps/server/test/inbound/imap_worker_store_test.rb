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
    refute connection.queries.first.last.any? { |value| value.to_s.include?("credential_ref") }
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
end
