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

class CampaignRepositoryMutationTest < Minitest::Test
  ID = CampaignRepositoryTest::ID
  OP = CampaignRepositoryTest::OP
  ORG = CampaignRepositoryTest::ORG
  Connection = CampaignRepositoryTest::Connection

  def input
    Elevateo::Campaigns::Input.new(kind: "campaign", value: {
      "id" => ID, "operation_id" => OP, "name" => "Paused pilot", "status" => "paused"
    })
  end

  def test_update_serializes_operation_and_returns_persisted_version
    updated = { "id" => ID, "name" => "Paused pilot", "status" => "paused", "version" => 2 }
    connection = Connection.new([[], [], [updated], [updated], []])
    result = Elevateo::Campaigns::Repository.new(connection: connection).replace(input,
      organization_id: ORG, expected_version: 1)
    assert_equal ["paused", 2], result.values_at("status", "version")
    assert_match(/pg_advisory_xact_lock/, connection.calls.first.first)
    assert(connection.calls.any? { |call| call.first.include?("INSERT INTO app.campaign_mutations") })
  end

  def test_stale_version_fails_without_ledger_insert
    connection = Connection.new([[], [], [], [{ "id" => ID }]])
    error = assert_raises(Elevateo::CollaborationError) do
      Elevateo::Campaigns::Repository.new(connection: connection).replace(input,
        organization_id: ORG, expected_version: 1)
    end
    assert_equal "draft_conflict", error.code
    refute(connection.calls.any? { |call| call.first.include?("INSERT INTO app.campaign_mutations") })
  end

  def test_page_caps_and_scopes_cursor_to_tenant
    first = { "id" => ID, "name" => "One", "status" => "draft", "version" => 1 }
    second = { "id" => OP, "name" => "Two", "status" => "paused", "version" => 1 }
    connection = Connection.new([[first, second]])
    page = Elevateo::Campaigns::Repository.new(connection: connection).page(kind: "campaign",
      organization_id: ORG, limit: 1)
    assert_equal ID, page.fetch("items").first.fetch("id")
    assert_equal ID, page.fetch("next_cursor")
    assert_includes connection.calls.first.first, "organization_id=$1::uuid"
    assert_equal ORG, connection.calls.first.last.first
  end
end

class CampaignRepositoryReplayTest < Minitest::Test
  ID = CampaignRepositoryTest::ID
  OP = CampaignRepositoryTest::OP
  ORG = CampaignRepositoryTest::ORG
  Connection = CampaignRepositoryTest::Connection

  def test_exact_http_intent_replays_original_result_after_current_state_changes
    intent = { "operation_id" => OP, "expected_version" => 1, "name" => "Pilot", "status" => "paused" }
    original = { "id" => ID, "name" => "Pilot", "status" => "paused", "version" => 2 }
    fingerprint = Digest::SHA256.hexdigest(JSON.generate(["campaign", ID, 1, intent.sort.to_h, nil]))
    connection = Connection.new([[], [{ "fingerprint" => fingerprint, "result" => JSON.generate(original) }]])
    changed = Elevateo::Campaigns::Input.new(kind: "campaign", value: {
      "id" => ID, "operation_id" => OP, "name" => "New current name", "status" => "draft"
    })
    assert_equal original, Elevateo::Campaigns::Repository.new(connection: connection).replace(changed,
      organization_id: ORG, expected_version: 1, intent: intent)
    refute(connection.calls.any? { |call| call.first.start_with?("UPDATE app.campaigns") })
  end
end
