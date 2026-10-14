# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/outreach_sequence/repository"

class OutreachSequenceRepositoryTest < Minitest::Test
  Input = Elevateo::OutreachSequence::DraftInput
  Repository = Elevateo::OutreachSequence::Repository
  ID = "11111111-1111-4111-8111-111111111111"
  CAMPAIGN = "22222222-2222-4222-8222-222222222222"
  OPERATION = "33333333-3333-4333-8333-333333333333"
  STEP = "44444444-4444-4444-8444-444444444444"
  DIGEST = "a" * 64

  class Connection
    Result = Struct.new(:to_a)
    attr_accessor :existing, :replay, :authorized, :read_authorized, :history, :steps
    attr_reader :sql, :transactions

    def initialize
      @sql = []
      @transactions = 0
      @authorized = true
      @read_authorized = true
      @history = false
    end

    def transaction
      @transactions += 1
      yield
    end

    def exec_query(sql, _label, _binds)
      @sql << sql
      rows = if sql.include?("authorize_outreach_draft_write")
        [{ "result" => { "status" => @authorized ? "ok" : "denied" } }]
      elsif sql.include?("authorize_outreach_content_read")
        [{ "result" => { "status" => @read_authorized ? "ok" : "not_found" } }]
      elsif sql.include?("SELECT fingerprint,result")
        @replay ? [@replay] : []
      elsif sql.include?("SELECT id,campaign_id,status,timezone,version")
        @existing ? [@existing] : []
      elsif sql.include?("to_char(local_time")
        @steps || []
      elsif sql.include?("SELECT id,version,timezone FROM app.campaign_sequences")
        @existing ? [@existing] : []
      elsif sql.include?("SELECT 1 FROM app.campaign_sequence_occurrences")
        @history ? [{ "?column?" => 1 }] : []
      else
        []
      end
      Result.new(rows)
    end
  end

  def input(version: nil, timezone: "Europe/Berlin")
    Input.new(value: { "id" => ID, "campaign_id" => CAMPAIGN, "operation_id" => OPERATION,
      "expected_version" => version, "status" => "held", "timezone" => timezone,
      "steps" => [{ "id" => STEP, "position" => 1, "delay_seconds" => 0,
        "local_time" => "09:00:00", "label" => "First" }] })
  end

  def test_create_serializes_and_saves_steps_and_replay_result
    connection = Connection.new
    result = Repository.new(connection: connection).save(input, organization_id: CAMPAIGN, session_digest: DIGEST)
    assert_equal 1, result.fetch("version")
    assert_equal 1, connection.transactions
    assert connection.sql.any? { |sql| sql.include?("pg_advisory_xact_lock") }
    assert connection.sql.any? { |sql| sql.include?("INSERT INTO app.campaign_sequence_steps") }
    assert connection.sql.any? { |sql| sql.include?("INSERT INTO app.campaign_sequence_mutations") }
  end

  def test_exact_replay_does_not_mutate_and_mismatch_fails
    connection = Connection.new
    draft = input
    connection.replay = { "fingerprint" => draft.fingerprint, "result" => { "id" => ID, "version" => 1 } }
    assert_equal 1, Repository.new(connection: connection).save(draft, organization_id: CAMPAIGN, session_digest: DIGEST).fetch("version")
    refute connection.sql.any? { |sql| sql.include?("INSERT INTO") }
    connection.replay["fingerprint"] = "0" * 64
    error = assert_raises(Elevateo::OutreachSequence::DraftError) do
      Repository.new(connection: connection).save(draft, organization_id: CAMPAIGN, session_digest: DIGEST)
    end
    assert_equal "operation_mismatch", error.code
  end

  def test_stale_version_and_timezone_change_with_history_fail_closed
    connection = Connection.new
    connection.existing = { "id" => ID, "version" => 2, "timezone" => "Europe/Berlin" }
    repository = Repository.new(connection: connection)
    stale = assert_raises(Elevateo::OutreachSequence::DraftError) do
      repository.save(input(version: 1), organization_id: CAMPAIGN, session_digest: DIGEST)
    end
    assert_equal "draft_conflict", stale.code
    connection.history = true
    changed = assert_raises(Elevateo::OutreachSequence::DraftError) do
      repository.save(input(version: 2, timezone: "Europe/London"), organization_id: CAMPAIGN, session_digest: DIGEST)
    end
    assert_equal "reschedule_required", changed.code
    refute connection.sql.any? { |sql| sql.include?("DELETE FROM app.campaign_sequence_steps") }
  end

  def test_denied_role_never_creates_sequence
    connection = Connection.new
    connection.authorized = false
    error = assert_raises(Elevateo::OutreachSequence::DraftError) do
      Repository.new(connection: connection).save(input, organization_id: CAMPAIGN, session_digest: DIGEST)
    end
    assert_equal "not_available", error.code
    refute connection.sql.any? { |sql| sql.include?("INSERT INTO app.campaign_sequences") }
  end

  def test_fetch_uses_read_authority_and_returns_ordered_draft
    connection = Connection.new
    connection.existing = { "id" => ID, "campaign_id" => CAMPAIGN, "status" => "held",
      "timezone" => "Europe/Berlin", "version" => 2 }
    connection.steps = [{ "id" => STEP, "position" => 1, "delay_seconds" => 0,
      "local_time" => "09:00:00", "label" => "First" }]
    result = Repository.new(connection: connection).fetch(campaign_id: CAMPAIGN,
      organization_id: CAMPAIGN, session_digest: DIGEST)
    assert_equal 2, result.fetch("version")
    assert_equal "09:00:00", result.fetch("steps").first.fetch("local_time")
    assert connection.sql.any? { |sql| sql.include?("authorize_outreach_content_read") }
    refute connection.sql.any? { |sql| sql.include?("authorize_outreach_draft_write") }
  end

  def test_fetch_hides_absent_and_forbidden_draft
    connection = Connection.new
    repository = Repository.new(connection: connection)
    assert_nil repository.fetch(campaign_id: CAMPAIGN, organization_id: CAMPAIGN, session_digest: DIGEST)
    reads = connection.sql.count { |sql| sql.include?("SELECT id,campaign_id,status,timezone,version") }
    connection.existing = { "id" => ID, "campaign_id" => CAMPAIGN }
    connection.read_authorized = false
    assert_nil repository.fetch(campaign_id: CAMPAIGN, organization_id: CAMPAIGN, session_digest: DIGEST)
    assert_equal reads, connection.sql.count { |sql| sql.include?("SELECT id,campaign_id,status,timezone,version") }
  end
end
