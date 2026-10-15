# frozen_string_literal: true

require "active_record"
require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_worker_store"
require_relative "../support/mail_binding"

# AIDEV-NOTE: Claims cross the SQL/Ruby boundary; malformed scope must fail before any resolver or network call.
class ImapClaimTest < Minitest::Test
  include MailBindingFixture
  Connection = Struct.new(:row, :calls) do
    def exec_query(sql, _, binds)
      calls << [sql, binds.map(&:value_for_database)]
      row
    end
  end

  def payload
    { "account_id" => mail_binding.account_id, "organization_id" => mail_binding.organization_id,
      "mailbox_id" => mail_binding.mailbox_id, "credential_ref" => "test:synthetic", "credential_version" => 1,
      "uidvalidity" => nil, "last_uid" => 0 }
  end

  def claim(value, raw: false)
    connection = Connection.new([{ "result" => raw ? value : JSON.generate(value) }], [])
    result = Elevateo::Inbound::ImapWorkerStore.new(connection: connection).claim(
      account_id: mail_binding.account_id, credential_version: 1)
    assert_equal [[Elevateo::Inbound::ImapWorkerStore::CLAIM_SQL, [mail_binding.account_id, "1"]]], connection.calls
    result
  end

  def test_complete_binding_preserves_sql_authority_and_cursor
    result = claim(payload)
    assert_equal mail_binding.key(protocol: "imap"), result.fetch("binding").key(protocol: "imap")
    assert_nil result.fetch("uidvalidity")
    assert_equal 0, result.fetch("last_uid")
    result = claim(payload.merge("uidvalidity" => 4_294_967_295, "last_uid" => 4_294_967_295))
    assert_equal 4_294_967_295, result.fetch("last_uid")
  end

  def test_old_partial_null_or_foreign_claims_are_rejected
    invalid = [nil, [], {}, payload.reject { |key, _| key == "organization_id" }, payload.merge("extra" => true),
      payload.merge("account_id" => mail_binding.mailbox_id), payload.merge("credential_version" => 2),
      payload.merge("mailbox_id" => nil), payload.merge("credential_ref" => "secret://production"),
      payload.merge("last_uid" => -1), payload.merge("last_uid" => 4_294_967_296),
      payload.merge("last_uid" => "1"), payload.merge("last_uid" => 1),
      payload.merge("uidvalidity" => 0), payload.merge("uidvalidity" => 4_294_967_296),
      payload.merge("uidvalidity" => "42")]
    invalid.each do |value|
      assert_equal "account_unavailable", assert_raises(Elevateo::Inbound::Rejected) { claim(value) }.code
    end
    [nil, "{malformed"].each do |value|
      assert_equal "account_unavailable", assert_raises(Elevateo::Inbound::Rejected) { claim(value, raw: true) }.code
    end
  end
end
