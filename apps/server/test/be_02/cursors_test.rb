# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/cursors"

class CursorsTest < Minitest::Test
  SECRET = "disposable-cursor-test-secret-0001"

  def setup
    @now = 1_800_000_000
    @cursor = Elevateo::Cursors.new(secret: SECRET, clock: -> { @now })
    @scope = { "actor_id" => "00000000-0000-4000-8000-000000000001",
               "organization_id" => "00000000-0000-4000-8000-000000000011",
               "context_id" => "context_A_0123456789", "authorization_version" => "authz_A_0123456789",
               "resource" => "mailboxes", "filters" => {}, "order" => "id:asc", "limit" => 50 }
    @position = { "id" => "00000000-0000-4000-8000-000000000021" }
  end

  def test_round_trip_and_nullable_thread_position
    [@position, @position.merge("last_activity_at" => nil)].each do |position|
      token = @cursor.encode(position: position, scope: @scope)
      assert_operator token.bytesize, :<=, 2048
      assert_equal position, @cursor.decode(token, scope: @scope)
    end
  end

  def test_every_authority_and_query_component_is_bound
    token = @cursor.encode(position: @position, scope: @scope)
    replacements = { "actor_id" => "00000000-0000-4000-8000-000000000002",
                     "organization_id" => "00000000-0000-4000-8000-000000000012",
                     "context_id" => "context_B_0123456789", "authorization_version" => "authz_B_0123456789",
                     "resource" => "threads", "filters" => { "mailbox_id" => @position.fetch("id") },
                     "order" => "id:desc", "limit" => 49 }
    replacements.each do |key, value|
      assert_raises(Elevateo::Cursors::Invalid, key) { @cursor.decode(token, scope: @scope.merge(key => value)) }
    end
  end

  def test_scope_hash_order_is_irrelevant_and_inputs_do_not_mutate
    @scope["filters"] = { "query" => "café", "mailbox_id" => @position.fetch("id") }
    before = JSON.generate([@scope, @position])
    token = @cursor.encode(position: @position, scope: @scope)
    reordered = @scope.to_a.reverse.to_h.merge("filters" => @scope.fetch("filters").to_a.reverse.to_h)
    assert_equal @position, @cursor.decode(token, scope: reordered)
    assert_equal before, JSON.generate([@scope, @position])
  end

  def test_expiry_boundary_and_clock_rollback_fail_closed
    token = @cursor.encode(position: @position, scope: @scope)
    @now += Elevateo::Cursors::TTL - 1
    assert_equal @position, @cursor.decode(token, scope: @scope)
    @now += 1
    assert_raises(Elevateo::Cursors::Invalid) { @cursor.decode(token, scope: @scope) }
    @now -= Elevateo::Cursors::TTL + 1
    assert_raises(Elevateo::Cursors::Invalid) { @cursor.decode(token, scope: @scope) }
  end

  def test_tamper_bad_encoding_size_and_key_rotation
    token = @cursor.encode(position: @position, scope: @scope)
    changed = token.dup
    changed[0] = changed[0] == "A" ? "B" : "A"
    [nil, "", "x" * 2049, "💌.signature", "\xFF".force_encoding("UTF-8"), changed, "#{token}="].each do |value|
      assert_raises(Elevateo::Cursors::Invalid) { @cursor.decode(value, scope: @scope) }
    end
    rotated = Elevateo::Cursors.new(secret: "replacement-secret-32-bytes-long!", clock: -> { @now })
    assert_raises(Elevateo::Cursors::Invalid) { rotated.decode(token, scope: @scope) }
    assert_raises(ArgumentError) { Elevateo::Cursors.new(secret: "short") }
  end

  def test_signed_malformed_payloads_are_not_accepted
    token = @cursor.encode(position: @position, scope: @scope)
    payload = JSON.parse(Base64.urlsafe_decode64(token.split(".").first))
    [{ "v" => 1.0 }, { "v" => 2 }, { "expires_at" => "later" }, { "position" => {} },
     { "position" => { "id" => [] } }, { "extra" => true }].each do |change|
      assert_raises(Elevateo::Cursors::Invalid) { @cursor.decode(signed(payload.merge(change)), scope: @scope) }
    end
  end

  def test_invalid_scope_limits_and_oversized_position
    [0, 51, 1.5].each do |limit|
      assert_raises(Elevateo::Cursors::Invalid) do
        @cursor.encode(position: @position, scope: @scope.merge("limit" => limit))
      end
    end
    assert_raises(Elevateo::Cursors::Invalid) { @cursor.encode(position: { "id" => "x" * 257 }, scope: @scope) }
    assert_raises(Elevateo::Cursors::Invalid) { @cursor.encode(position: @position, scope: @scope.merge("extra" => nil)) }
    assert_raises(Elevateo::Cursors::Invalid) { @cursor.encode(position: @position, scope: @scope.reject { |k, _| k == "resource" }) }
  end

  private

  # AIDEV-NOTE: Re-sign deliberately malformed test payloads to exercise validation after authentication.
  def signed(payload)
    encoded = Base64.urlsafe_encode64(JSON.generate(payload), padding: false)
    signature = OpenSSL::HMAC.digest("SHA256", SECRET, "elevateo/read-cursor/v1\0#{encoded}")
    "#{encoded}.#{Base64.urlsafe_encode64(signature, padding: false)}"
  end
end
