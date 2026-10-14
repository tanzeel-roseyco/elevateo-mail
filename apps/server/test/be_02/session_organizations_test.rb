# frozen_string_literal: true

require_relative "auth_test_helper"
require_relative "../../lib/elevateo/session_organizations"

class SessionOrganizationsTest < Minitest::Test
  include AuthFixtures

  class PageStore
    attr_reader :calls
    def initialize = (@calls = [])
    def call(name, arguments, deadline:, connection: nil)
      deadline.check!
      @calls << [name, arguments, connection]
      { "status" => "ok", "organizations" => [{ "id" => AuthFixtures::ORG, "name" => "Org" }],
        "next_after" => AuthFixtures::ORG }
    end
  end

  def setup
    @service, _store, _client, @cookie = harness
    @identity = @service.authenticate(cookie: @cookie, deadline: deadline)
    @session = @service.presentation.session(metadata)
    @store = PageStore.new
    @pages = Elevateo::SessionOrganizations.new(store: @store, crypto: @service.crypto)
  end

  def page(query = {}, session = @session)
    @pages.page(identity: @identity, session: session, query: query, connection: Object.new, deadline: deadline)
  end

  def test_stable_page_and_cursor_preserve_authenticated_scope
    result = page("limit" => "1")
    assert_equal [{ "id" => ORG, "name" => "Org" }], result["items"]
    assert_operator result["next_cursor"].bytesize, :<=, 2048
    page("limit" => "1", "cursor" => result["next_cursor"])
    assert_equal [@identity.digest, USER, SID, ORG, 1], @store.calls.last[1]
  end

  def test_cursor_tampering_and_query_changes_reject_before_database
    cursor = page("limit" => "1")["next_cursor"]
    before = @store.calls.length
    assert_auth(400) { page("limit" => "2", "cursor" => cursor) }
    assert_auth(400) { page("limit" => "1", "cursor" => cursor + "x") }
    assert_equal before, @store.calls.length
  end

  def test_stale_cursor_context_is_409_and_limits_are_bounded
    cursor = page["next_cursor"]
    assert_auth(409) { page({ "cursor" => cursor }, @session.merge("context_id" => ORG)) }
    ["0", "51", "-1", "1.5", "01"].each { |limit| assert_auth(400) { page("limit" => limit) } }
  end
end
