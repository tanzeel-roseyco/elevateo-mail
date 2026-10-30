# frozen_string_literal: true

require_relative "collaboration_controller_helper"
require_relative "../../lib/elevateo/mail_search"
require_relative "../../app/controllers/v1/search_controller"

class ThreadNotesCursorTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  # AIDEV-NOTE: Real C/D controllers share session precedence; canned SQL does not establish database/RLS behavior.
  class SearchController < V1::SearchController
    include CollaborationControllerHarness::Sessions
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = CollaborationControllerHarness::Connection.new(metadata)
  end

  def teardown
    refute @connection.transaction_open?
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end

  def routes
    [[NotesController, "mailbox_id=#{BOX}"], [SearchController, "mailbox_id=#{BOX}&q=needle"]]
  end

  def invalid_cursors = ["invalid", "", "x" * 2049]

  def assert_error(status, code, result)
    assert_equal status, result[0]
    assert_equal code, result[2].fetch("code")
    assert_equal %w[code message request_id], result[2].keys.sort
  end

  def test_omitted_cursor_returns_first_page
    routes.each do |controller, query|
      @connection.rows = [[{ "id" => THREAD }], []]
      result = dispatch_collaboration(controller, "index", query: query)
      assert_equal 200, result[0]
      assert_empty result[2].fetch("items")
      assert_nil result[2].fetch("next_cursor")
      assert_empty @connection.rows
    end
  end

  def test_malformed_empty_and_oversized_cursors_return_exact_cursor_error
    routes.each do |controller, query|
      invalid_cursors.each do |cursor|
        @connection.rows = [[{ "id" => THREAD }]]
        result = dispatch_collaboration(controller, "index", query: "#{query}&cursor=#{cursor}")
        assert_error(400, "cursor_invalid", result)
        assert_empty @connection.rows
      end
    end
  end

  def test_hidden_resource_precedes_each_cursor_error
    routes.each do |controller, query|
      invalid_cursors.each do |cursor|
        @connection.rows = [[]]
        result = dispatch_collaboration(controller, "index", query: "#{query}&cursor=#{cursor}")
        assert_error(404, "not_available", result)
        assert_equal "This item is unavailable.", result[2].fetch("message")
        assert_empty @connection.rows
      end
    end
  end

  def test_revoked_session_precedes_stale_context_and_cursor_errors
    @store.state[:revoked] = true
    routes.each do |controller, query|
      invalid_cursors.each do |cursor|
        result = dispatch_collaboration(controller, "index", query: "#{query}&cursor=#{cursor}",
          headers: { "HTTP_X_SESSION_CONTEXT" => "stale-context-0001" })
        assert_error(401, "unauthenticated", result)
        assert_empty @connection.business
      end
    end
  end

  def test_current_session_stale_context_precedes_cursor_errors
    routes.each do |controller, query|
      invalid_cursors.each do |cursor|
        result = dispatch_collaboration(controller, "index", query: "#{query}&cursor=#{cursor}",
          headers: { "HTTP_X_SESSION_CONTEXT" => "stale-context-0001" })
        assert_error(409, "context_changed", result)
        assert_empty @connection.business
      end
    end
  end
end
