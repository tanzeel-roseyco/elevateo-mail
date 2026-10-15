# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "securerandom"
require_relative "../support/mail_binding"
require_relative "../../lib/elevateo/mail_credentials/bundle"
require_relative "../../lib/elevateo/inbound/tls_imap_transport"

class MailCredentialsTest < Minitest::Test
  include MailBindingFixture
  Bundle = Elevateo::MailCredentials::Bundle
  Unavailable = Elevateo::MailCredentials::Unavailable

  def setup
    @directory = Dir.mktmpdir("private-credentials-")
    @path = File.join(@directory, "bundle.json")
  end

  def teardown = FileUtils.remove_entry_secure(@directory)

  def entry(**changes)
    { account_id: mail_binding.account_id, organization_id: mail_binding.organization_id,
      mailbox_id: mail_binding.mailbox_id, credential_version: 1, credential_ref: "test:synthetic",
      protocol: "imap", username: "seed@seed.test", password: "synthetic-private-value" }.merge(changes)
  end

  def write(entries = [entry], **changes)
    File.write(@path, JSON.generate({ format_version: 1, entries: entries }.merge(changes)))
    File.chmod(0o600, @path)
    @path
  end

  def assert_unavailable
    error = assert_raises(Unavailable) { yield }
    assert_equal "mail_credentials_unavailable", error.message
    assert_nil error.cause
    refute_includes error.full_message, "synthetic-private-value"
    refute_includes error.full_message, @path
  end

  def test_protocols_are_separate_immutable_and_loaded_only_once
    resolver = Bundle.new(path: write([entry, entry(protocol: "smtp", password: "smtp-only")]))
    File.unlink(@path)
    assert_equal ["seed@seed.test", "synthetic-private-value"], resolver.call(mail_binding, protocol: "imap")
    assert_equal ["seed@seed.test", "smtp-only"], resolver.call(mail_binding, protocol: "smtp")
    credentials = resolver.call(mail_binding, protocol: "imap")
    assert credentials.frozen?
    assert credentials.all?(&:frozen?)
    refute_includes resolver.inspect, "synthetic-private-value"
    refute_includes resolver.to_s, "seed@seed.test"
  end

  def test_each_identity_field_and_protocol_prevents_foreign_lookup
    resolver = Bundle.new(path: write)
    changes = { account_id: SecureRandom.uuid, organization_id: SecureRandom.uuid,
      mailbox_id: SecureRandom.uuid, credential_version: 2, credential_ref: "test:foreign" }
    changes.each do |key, value|
      assert_unavailable { resolver.call(mail_binding(**{ key => value }), protocol: "imap") }
    end
    ["smtp", "IMAP", "pop3", ""].each do |protocol|
      assert_unavailable { resolver.call(mail_binding, protocol: protocol) }
    end
  end

  def test_resolver_denial_precedes_any_network_connection
    resolver = Bundle.new(path: write)
    factory = Object.new
    connections = 0
    factory.define_singleton_method(:new) { |*_, **_| connections += 1; raise "network reached" }
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "mox.test", credential_resolver: resolver,
      client_factory: factory)
    assert_unavailable { transport.open(binding: mail_binding(credential_version: 2)) }
    assert_equal 0, connections
  end

  def test_missing_invalid_and_duplicate_json_has_no_parser_or_path_leak
    assert_unavailable { Bundle.new(path: @path) }
    ["{synthetic-private-value", "[]", "null",
      JSON.generate(format_version: 1, entries: [entry]).sub('"format_version":1', '"format_version":1,"format_version":1'),
      JSON.generate(format_version: 1, entries: [entry]).sub('"protocol":"imap"',
        '"protocol":"imap","protocol":"smtp"'), "\xFF".b].each do |bytes|
      File.write(@path, bytes)
      File.chmod(0o600, @path)
      assert_unavailable { Bundle.new(path: @path) }
    end
  end

  def test_schema_and_credential_boundaries_fail_closed
    invalid = [[], [entry, entry], [entry(extra: true)], [entry.reject { |key, _| key == :mailbox_id }],
      [entry(password: "")], [entry(password: "x" * 4097)], [entry(username: "x" * 255)], [entry(username: "")],
      [entry(password: "line\nsecret")], [entry(password: "line\rsecret")], [entry(password: "null\0secret")],
      [entry(username: "null\0name")], [entry(username: "line\nname")], [entry(username: "line\rname")], [entry(protocol: "pop3")],
      [entry(credential_version: 0)], [entry(credential_version: 2_147_483_648)],
      [entry(account_id: nil)], [entry(account_id: "bad-uuid")], [entry(mailbox_id: "bad-uuid")],
      [entry(organization_id: "bad-uuid")], [entry(credential_ref: "test:")], [entry(credential_ref: "test:#{'x' * 121}")],
      [entry(credential_ref: "secret://production")]]
    invalid.each { |entries| assert_unavailable { Bundle.new(path: write(entries)) } }
    [0, 1.0, "1", nil].each do |version|
      assert_unavailable { Bundle.new(path: write([entry], format_version: version)) }
    end
    assert_unavailable { Bundle.new(path: write([entry], extra: true)) }
  end

  def test_maximum_individual_lengths_are_accepted_within_total_bundle_limit
    reference = "test:#{'x' * 120}"
    resolver = Bundle.new(path: write([entry(username: "u" * 254, password: "p" * 4096,
      credential_ref: reference, credential_version: 2_147_483_647)]))
    credentials = resolver.call(mail_binding(credential_ref: reference, credential_version: 2_147_483_647), protocol: "imap")
    assert_equal [254, 4096], credentials.map(&:bytesize)
  end

  def test_private_file_type_permissions_and_links
    write
    [0o644, 0o400, 0o4600].each do |mode|
      File.chmod(mode, @path)
      assert_unavailable { Bundle.new(path: @path) }
    end
    File.chmod(0o600, @path)
    link = File.join(@directory, "alias")
    File.symlink(@path, link)
    assert_unavailable { Bundle.new(path: link) }
    File.unlink(link)
    File.link(@path, link)
    assert_unavailable { Bundle.new(path: @path) }
    assert_unavailable { Bundle.new(path: @directory) }
    assert_unavailable { Bundle.new(path: "relative.json") }
  end

  def test_file_and_entry_counts_are_bounded
    File.write(@path, "x" * (Bundle::MAX_BYTES + 1))
    File.chmod(0o600, @path)
    assert_unavailable { Bundle.new(path: @path) }
    entries = (0...Bundle::MAX_ENTRIES).map { |index| entry(credential_ref: "test:account-#{index}") }
    resolver = Bundle.new(path: write(entries))
    assert_equal "seed@seed.test", resolver.call(mail_binding(credential_ref: "test:account-1423"), protocol: "imap").first
    entries << entry(credential_ref: "test:overflow")
    assert_unavailable { Bundle.new(path: write(entries)) }
  end
end
