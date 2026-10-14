# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/campaigns/repository"

class CampaignRepositoryTest < Minitest::Test
  ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  OP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

  Result = Struct.new(:to_a)
  class Connection
    attr_reader :calls
    def initialize(responses)
      @responses = responses
      @calls = []
    end

    def exec_query(sql, name, binds)
      @calls << [sql, name, binds.map(&:value_for_database)]
      Result.new(@responses.shift || [])
    end
  end

  def draft
    Elevateo::Campaigns::Input.new(kind: "campaign", value: {
      "id" => ID, "operation_id" => OP, "name" => "Pilot", "status" => "paused"
    })
  end

  def test_insert_returns_durable_identity_without_transport
    connection = Connection.new([[{ "id" => ID }]])
    assert_equal ID, Elevateo::Campaigns::Repository.new(connection: connection).save(draft, organization_id: ORG)
    assert_match(/ON CONFLICT .* DO NOTHING/m, connection.calls.first.first)
    refute_match(/send_intents|provider|smtp/i, connection.calls.first.first)
  end

  def test_idempotent_replay_requires_same_fields
    connection = Connection.new([[], [{ "id" => ID, "name" => "Pilot", "status" => "paused" }]])
    assert_equal ID, Elevateo::Campaigns::Repository.new(connection: connection).save(draft, organization_id: ORG)
    mismatch = Connection.new([[], [{ "id" => ID, "name" => "Changed", "status" => "paused" }]])
    error = assert_raises(Elevateo::CollaborationError) do
      Elevateo::Campaigns::Repository.new(connection: mismatch).save(draft, organization_id: ORG)
    end
    assert_equal "operation_mismatch", error.code
  end

  def test_missing_or_cross_tenant_replay_fails_closed
    connection = Connection.new([[], []])
    error = assert_raises(Elevateo::CollaborationError) do
      Elevateo::Campaigns::Repository.new(connection: connection).save(draft, organization_id: ORG)
    end
    assert_equal "not_available", error.code
    assert_includes connection.calls.last.first, "organization_id=$1::uuid"
  end
end
