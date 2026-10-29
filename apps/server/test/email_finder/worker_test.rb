# frozen_string_literal: true

require "minitest/autorun"
require "json"
require_relative "../../lib/elevateo/email_finder/worker"

class EmailFinderWorkerTest < Minitest::Test
  class MemoryRepository
    attr_reader :states, :writes
    def initialize
      @states = {}
      @writes = []
    end
    def state_get(key) = @states.fetch(key, {})
    def state_put(key, value) = @states[key] = value
    def rows(sql, args = [])
      @writes << [sql, args]
      if sql.include?("VALUES('smtp'")
        @states["smtp"] = JSON.parse(args[0])
        @states[args[1]] = JSON.parse(args[2])
      end
      []
    end
    def suppression_rules(_org) = {}
    def suppressed?(*_args) = false
    def object(value) = value.is_a?(String) ? JSON.parse(value) : value
  end

  def setup
    @repository = MemoryRepository.new
    @worker = Elevateo::EmailFinder::Worker.new(repository: @repository, public_ip: "", discovery: Object.new, smtp: Object.new)
  end

  def test_hard_daily_limit_cannot_be_configured_up
    50.times { |index| assert_nil @worker.reserve_probe("mx#{index}.example.com") }
    assert_operator @worker.reserve_probe("another.example.com"), :>, 0
    assert_equal 50, @repository.states.fetch("smtp").fetch("used")
  end

  def test_same_host_waits_at_least_60_seconds_across_instances
    assert_nil @worker.reserve_probe("mx.example.com")
    other = Elevateo::EmailFinder::Worker.new(repository: @repository, public_ip: "", discovery: Object.new, smtp: Object.new)
    assert_operator other.reserve_probe("mx.example.com"), :>=, 59
    assert_equal 1, @repository.states.fetch("smtp").fetch("used")
  end

  def test_greylist_blocks_host_and_blocklist_halts_all_hosts
    @worker.apply_backoff("mx.example.com", { "temporary" => true, "blocklisted" => false })
    assert_operator @worker.reserve_probe("mx.example.com"), :>=, 3599
    @worker.apply_backoff("mx.example.com", { "temporary" => false, "blocklisted" => true })
    assert_operator @worker.reserve_probe("unrelated.example.com"), :>=, 86_399
  end

  def test_three_attempts_never_trigger_a_fourth_probe
    @repository.state_put("health", { "available" => true })
    work = { "candidates" => [{ "email" => "jane@example.com", "pattern" => "first" }], "index" => 0,
      "attempts" => 3, "catch_attempts" => 1, "catch_all" => false, "host" => "mx.example.com", "sources" => [] }
    result = @worker.verify({}, [], work, "org", {})
    assert_equal "unknown", result.fetch("status")
    assert_empty @repository.writes
  end

  def test_catch_all_returns_risky_without_candidate_probe
    @repository.state_put("health", { "available" => true })
    work = { "candidates" => [{ "email" => "jane@example.com", "pattern" => "first" }], "index" => 0,
      "catch_all" => true, "host" => "mx.example.com", "sources" => [], "patterns" => { "first" => 4 }, "emails" => [] }
    result = @worker.verify({}, [], work, "org", {})
    assert_equal "risky", result.fetch("status")
    assert_empty @repository.writes
  end

  def test_csv_formula_cells_are_neutralized
    repo = Elevateo::EmailFinder::Repository.new(connection: Object.new)
    csv = repo.export({ "items" => [{ "row" => 1, "result" => { "status" => "unknown", "name" => "=HYPERLINK(1)", "reasons" => [], "sources" => [] } }] })
    assert_includes csv, "'=HYPERLINK(1)"
  end
  def test_suppression_checks_result_email_host_even_when_input_domain_differs
    repo = Elevateo::EmailFinder::Repository.new(connection: Object.new)
    rules = { "domain:optout.com" => true }
    assert repo.suppressed?("org", { "domain" => "example.com", "email" => "jane@sub.optout.com" }, rules)
    refute repo.suppressed?("org", { "domain" => "example.com", "email" => "jane@other.com" }, rules)
  end

  def test_verifier_uses_email_domain_and_decision_maker_rejects_wrong_role
    adapter = Object.new
    adapter.define_singleton_method(:discover) do |domain:, **_arguments|
      { "domain" => domain || "example.com", "emails" => [], "people" => [{ "name" => "Jane Doe", "title" => "CTO" }], "mx" => [], "sources" => [] }
    end
    worker = Elevateo::EmailFinder::Worker.new(repository: @repository, public_ip: "", discovery: adapter)
    verified = worker.discover("verify", { "email" => "jane@actual.com", "domain" => "wrong.com" }, "org")
    assert_equal "actual.com", verified.fetch("domain")
    decision = worker.discover("decision_maker", { "domain" => "example.com", "role" => "CEO" }, "org")
    assert_equal "unknown", decision.fetch("result").fetch("status")
    refute decision.fetch("result").key?("email")
  end

  def test_restart_resumes_current_row_without_repeating_completed_discovery
    prior = { "status" => "invalid", "confidence" => 0, "reasons" => [], "sources" => [], "checked_at" => Time.now.utc.iso8601 }
    work = { "candidates" => [{ "email" => "jane@example.com", "pattern" => "first" }], "index" => 0,
      "attempts" => 0, "catch_attempts" => 1, "catch_all" => true, "host" => "mx.example.com", "sources" => [], "patterns" => {}, "emails" => [] }
    items = [{ "row" => 1, "input" => { "email" => "old@example.com" }, "result" => prior },
      { "row" => 2, "input" => { "email" => "jane@example.com" }, "work" => work }]
    job = { "id" => "job", "organization_id" => "org", "kind" => "verify", "completed" => 1, "total" => 2, "items" => JSON.generate(items) }
    @worker.process(job)
    completion = @repository.writes.find { |sql, _| sql.include?("SET completed=") }.last
    assert_equal ["job", 2, "completed"], completion.first(3)
    resumed = JSON.parse(completion.fetch(3))
    assert_equal prior, resumed.first.fetch("result")
    assert_equal "risky", resumed.last.fetch("result").fetch("status")
    refute resumed.last.key?("work")
  end

  def test_person_opt_out_covers_unconfirmed_predictable_emails_but_not_unrelated_people
    repo = Elevateo::EmailFinder::Repository.new(connection: Object.new)
    repo.define_singleton_method(:suppressions) { |_org| [{ "kind" => "person", "value" => "jane doe" }] }
    rules = repo.suppression_rules("org")
    assert_instance_of Hash, rules
    assert rules.key?("email_local:jdoe")
    assert repo.suppressed?("org", { "email" => "jane.doe@example.com" }, rules)
    assert repo.suppressed?("org", { "email" => "jdoe@new-company.com" }, rules)
    refute repo.suppressed?("org", { "email" => "alice.smith@example.com" }, rules)
    refute repo.suppressed?("org", { "email" => "support@example.com" }, rules)
  end

end
