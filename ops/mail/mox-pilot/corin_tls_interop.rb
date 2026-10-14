# frozen_string_literal: true

# Synthetic in-memory adapter proof. SQL cursor/tenant guarantees need separate fleet DB tests.
require "digest"
require "json"
require "elevateo/inbound/imap_sync"
require "elevateo/inbound/tls_imap_transport"

ACCOUNT = "11111111-1111-4111-8111-111111111111"
TRUST = "/pilot-evidence/mox-localserve-trust.crt"
STATE = "/pilot-evidence/corin-tls-interop.json"

class PilotStore
  attr_accessor :last_uid
  attr_reader :records, :uidvalidity

  def initialize(previous = nil)
    @uidvalidity = previous&.fetch("uidvalidity", nil)
    @last_uid = previous&.fetch("last_uid", 0) || 0
    @records = previous&.fetch("records", {}) || {}
  end

  def claim(account_id:, credential_version:)
    raise "invalid synthetic account" unless account_id == ACCOUNT && credential_version == 1

    { "credential_ref" => "test:mox_localserve", "uidvalidity" => @uidvalidity, "last_uid" => @last_uid }
  end

  def reset_uidvalidity(account_id:, credential_version:, expected:, replacement:)
    raise "invalid synthetic reset" unless account_id == ACCOUNT && credential_version == 1 && expected == @uidvalidity

    @uidvalidity = replacement
    @last_uid = 0
    true
  end

  def insert_once(account_id:, credential_version:, uidvalidity:, uid:, content_sha256:, subject:, **)
    raise "invalid synthetic insert" unless account_id == ACCOUNT && credential_version == 1 && uidvalidity.positive?

    key = "#{account_id}:#{uidvalidity}:#{uid}"
    value = { "digest" => content_sha256, "subject" => subject }
    if @records.key?(key)
      raise "UID replay MIME mismatch" unless @records.fetch(key) == value

      @last_uid = [@last_uid, uid].max
      return { "result" => "duplicate" }
    end
    @records[key] = value
    @uidvalidity = uidvalidity
    @last_uid = uid
    { "result" => "created" }
  end

  def state
    { "uidvalidity" => @uidvalidity, "last_uid" => @last_uid, "records" => @records }
  end
end

def assert(condition, message)
  raise message unless condition
end

subject = ENV.fetch("MOX_PILOT_SUBJECT")
assert(subject.start_with?("MAIL818-SYNTHETIC-") && subject.length <= 100, "invalid synthetic subject")
assert(File.file?(TRUST), "missing synthetic Mox trust anchor")
previous = File.file?(STATE) ? JSON.parse(File.read(STATE)) : nil
store = PilotStore.new(previous)
resolver = ->(ref) { raise "unexpected credential ref" unless ref == "test:mox_localserve"; ["mox@localhost", "moxmoxmox"] }
transport = Elevateo::Inbound::TlsImapTransport.new(host: "localhost", port: 1993, ca_file: TRUST,
  credential_resolver: resolver)
sync = Elevateo::Inbound::ImapSync.new(store: store, transport: transport)
first = sync.run(account_id: ACCOUNT, credential_version: 1)
count = store.records.length
assert(count >= 2 && store.records.values.any? { |row| row.fetch("subject") == subject }, "synthetic mail not ingested")
assert(first == store.last_uid && first.positive?, "IMAP cursor failed to advance")
assert(sync.run(account_id: ACCOUNT, credential_version: 1) == first, "UID replay changed cursor")
assert(store.records.length == count, "UID replay duplicated ingestion")
store.last_uid = 0
assert(sync.run(account_id: ACCOUNT, credential_version: 1) == first, "reset cursor replay failed")
assert(store.records.length == count, "reset cursor replay duplicated ingestion")
if previous
  previous.fetch("records").each do |key, value|
    assert(store.records[key] == value, "same-volume restart changed an adapter observation")
  end
else
  File.write(STATE, JSON.generate(store.state))
end
puts "PASS: Corin held TLS adapter login, bounded ingestion, UID replay and in-memory cursor; SQL not exercised"
