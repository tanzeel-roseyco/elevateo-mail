# frozen_string_literal: true

require "minitest/autorun"
require_relative "acceptance_invitation"

class AcceptanceInvitationTransportTest < Minitest::Test
  def setup
    @invitation = Be02Acceptance::Invitation.allocate
    @invitation.instance_variable_set(:@delivery_deadline, 25.0)
    @now = 0.0
  end

  def response(chunks)
    value = Object.new
    value.define_singleton_method(:code) { "200" }
    value.define_singleton_method(:content_type) { "application/json" }
    value.define_singleton_method(:read_body) do |&block|
      chunks.each { |chunk| block.call(chunk) }
    end
    value
  end

  def with_http(response)
    http = Object.new
    http.define_singleton_method(:request) { |_request, &block| block.call(response) }
    start = ->(*_args, **_options, &block) { block.call(http) }
    Process.stub(:clock_gettime, ->(_clock) { @now }) do
      Net::HTTP.stub(:start, start) { yield }
    end
  end

  def request
    @invitation.request("mailpit", 8025, "get", "/api/v1/messages?limit=50")
  end

  def assert_timeout
    error = assert_raises(Be02Acceptance::Failure) { yield }
    assert_equal "invitation_delivery_timeout", error.message
  end

  def test_trickled_valid_body_is_rejected_at_deadline_before_parsing
    slow = response([])
    slow.define_singleton_method(:read_body) do |&block|
      26.times do |index|
        # Each simulated read takes one second, less than the initial three-second timeout.
        @advance.call(index + 1.0)
        block.call(index.zero? ? '{"secret":"' : (index == 25 ? '"}' : "a"))
      end
    end
    slow.instance_variable_set(:@advance, ->(time) { @now = time })
    parsed = false
    with_http(slow) do
      JSON.stub(:parse, ->(_body) { parsed = true; {} }) { assert_timeout { request } }
    end
    refute parsed
  end

  def test_json_parsing_cannot_return_a_late_result
    with_http(response(['{"ok":true}'])) do
      JSON.stub(:parse, ->(_body) { @now = 25.0; { "ok" => true } }) do
        assert_timeout { request }
      end
    end
  end

  def test_final_link_validation_cannot_return_a_late_capability
    @invitation.instance_variable_set(:@email, "recipient@example.test")
    link = "http://app.test/auth/accept?token=#{'a' * 64}&type=invite&redirect_to=http%3A%2F%2Fapp.test%2Fauth%2Fcomplete"
    recipient = { "Address" => "recipient@example.test" }
    replies = [{ "messages" => [{ "ID" => "owned", "To" => [recipient] }] },
      { "To" => [recipient], "Text" => link }]
    Process.stub(:clock_gettime, ->(_clock) { @now }) do
      @invitation.stub(:request, ->(*_args) { replies.shift }) do
        Be02Acceptance::Invitation.stub(:validate_link, ->(_link) { @now = 25.0; "a" * 64 }) do
          assert_timeout { @invitation.delivered_link }
        end
      end
    end
  end

  def test_on_time_json_and_existing_byte_cap
    with_http(response(['{"ok":true}'])) { assert_equal({ "ok" => true }, request) }
    with_http(response(["a" * 262_145])) do
      error = assert_raises(Be02Acceptance::Failure) { request }
      assert_equal "invitation_response_size_invalid", error.message
    end
  end
end
