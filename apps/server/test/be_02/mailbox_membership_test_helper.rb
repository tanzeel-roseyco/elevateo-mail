# frozen_string_literal: true

require "active_record"
require "minitest/autorun"
require_relative "../../lib/elevateo/mailbox_memberships"
require_relative "../../lib/elevateo/mail_search"
require_relative "../../lib/elevateo/session_crypto"

# AIDEV-NOTE: Unit adapters check wire boundaries; real-role database tests separately prove SQL and concurrency.
class MailboxMembershipUnitCase < Minitest::Test
  Identity = Struct.new(:user_id, :org_id, keyword_init: true)
  Key = Struct.new(:session_key)
  Error = Elevateo::CollaborationError
  class Connection
    attr_reader :calls
    def initialize(*replies) = (@replies, @calls = replies, [])
    def exec_query(sql, name, binds)
      @calls << [sql, name, binds.map(&:value_for_database)]
      raise "unexpected SQL" if @replies.empty?
      @replies.shift
    end
  end

  def setup
    path = File.expand_path("../../../../contracts/v1/fixtures.json", __dir__)
    @examples = JSON.parse(File.read(path)).fetch("examples")
    @session = @examples.fetch("session_a").fetch("body")
    @user, @org = @session.fetch("actor").fetch("id"), @session.fetch("organization").fetch("id")
    @identity = Identity.new(user_id: @user, org_id: @org)
    @box = @examples.fetch("threads").fetch("body").fetch("mailbox_id")
    @target = "ffffffff-ffff-4fff-8fff-ffffffffffff"
    @cursors = Elevateo::Cursors.new(secret: "disposable-membership-key-000001")
    @presentation = Elevateo::SessionPresentation.new(crypto: Elevateo::SessionCrypto.new(config: Key.new("d" * 32)))
    @flags = { "compose" => true, "approve_send" => false, "manage_members" => false }
  end

  def service(type, connection)
    type.new(connection: connection, identity: @identity, session: @session, cursors: @cursors)
  end

  def roster(connection, query = {})
    service(Elevateo::MailboxMemberships, connection).list(mailbox_id: @box, query: query)
  end

  def search(connection, query = {})
    service(Elevateo::MailSearch, connection).search(query: { "q" => "needle" }.merge(query))
  end

  def summary_row = @examples.fetch("threads").fetch("body").fetch("items").first
  def member_row(user = @user) = { "user_id" => user }.merge(@flags)
  def assert_code(code)
    assert_equal code, assert_raises(Error) { yield }.code
  end
end
