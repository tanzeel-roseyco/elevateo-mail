# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/send_worker/local_failure_driver"

# AIDEV-NOTE: These are offline Ruby seam tests, not real PostgreSQL lease/Auth or durable recovery evidence.
class LocalFailureDriverTest < Minitest::Test
  SEND = "11111111-1111-4111-8111-111111111111"
  ATTEMPT = "22222222-2222-4222-8222-222222222222"
  SECOND = "33333333-3333-4333-8333-333333333333"
  BYTES = '["elevateo.send.snapshot.v1","fixture"]'

  def setup = (@now = 100.0)

  def test_accept_and_reject_are_simulated_normalized_results
    driver = build("accept", "reject")
    accepted = submit(driver)
    assert_equal "accepted", accepted.kind
    assert_match(/\Alocal:[0-9a-f]{64}\z/, accepted.receipt_ref)
    assert_nil accepted.code
    assert accepted.simulated?
    assert accepted.frozen?
    rejected = submit(driver, attempt: SECOND)
    assert_equal "rejected", rejected.kind
    assert_equal "local_rejected", rejected.code
    assert_nil rejected.receipt_ref
    assert_equal 2, driver.invocations
  end

  def test_accept_then_timeout_recovers_only_exact_attempt_without_second_invocation
    driver = build("accept_then_timeout")
    result = submit(driver)
    assert_equal "unknown", result.kind
    assert_equal "local_timeout", result.code
    recovered = driver.observation(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: digest)
    assert_equal "accepted", recovered.kind
    assert_nil driver.observation(send_id: SECOND, attempt_id: ATTEMPT, snapshot_digest: digest)
    assert_nil driver.observation(send_id: SEND, attempt_id: SECOND, snapshot_digest: digest)
    assert_nil driver.observation(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: "0" * 64)
    assert_equal 1, driver.invocations
  end

  def test_later_acceptance_cannot_fabricate_evidence_for_rejected_attempt
    driver = build("reject", "accept")
    submit(driver)
    submit(driver, attempt: SECOND)
    assert_nil driver.observation(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: digest)
    assert_equal "accepted", driver.observation(send_id: SEND, attempt_id: SECOND, snapshot_digest: digest).kind
  end

  def test_pause_deadline_keeps_uncertainty_and_expired_preflight_does_not_invoke
    driver = build("pause", pause: -> { @now += 10.0 })
    result = submit(driver)
    assert_equal "deadline_expired", result.code
    assert_equal 1, driver.invocations
    assert_nil driver.observation(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: digest)
    driver = build("accept")
    budget = deadline
    @now += 10.0
    result = driver.submit(BYTES, send_id: SEND, attempt_id: ATTEMPT, deadline: budget)
    assert_equal "unknown", result.kind
    assert_equal 0, driver.invocations
  end

  def test_invalid_production_profiles_scripts_and_bindings_are_rejected
    %w[production staging live].each do |profile|
      assert_raises(ArgumentError) { Elevateo::SendWorker::LocalFailureDriver.new(profile: profile, outcomes: ["accept"]) }
    end
    [nil, "accept", [], [nil], ["delivered"], ["accept"] * 101].each do |outcomes|
      assert_raises(ArgumentError) { Elevateo::SendWorker::LocalFailureDriver.new(profile: "local", outcomes: outcomes) }
    end
    assert_raises(ArgumentError) { Elevateo::SendWorker::LocalFailureDriver.new(profile: "local", outcomes: ["pause"], pause: nil) }
    driver = build("accept")
    ["", "\xFF", "a" * 1_048_577].each do |bytes|
      assert_raises(ArgumentError) { driver.submit(bytes, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline) }
    end
    assert_raises(ArgumentError) { driver.submit(BYTES, send_id: "foreign", attempt_id: ATTEMPT, deadline: deadline) }
    assert_equal 0, driver.invocations
  end

  def test_snapshot_attempt_and_script_bounds_prevent_implicit_retries
    driver = build("accept", "accept")
    submit(driver)
    assert_raises(ArgumentError) { submit(driver) }
    assert_raises(ArgumentError) { submit(driver, bytes: BYTES + " ", attempt: SECOND) }
    assert_equal 1, driver.invocations
    submit(driver, attempt: SECOND)
    assert_raises(ArgumentError) { submit(driver, attempt: "44444444-4444-4444-8444-444444444444") }
    assert_equal 2, driver.invocations
  end

  def test_mutation_after_reservation_cannot_change_attempt_or_snapshot_binding
    bytes, send_id, attempt_id = BYTES.dup, SEND.dup, ATTEMPT.dup
    checks = 0
    clock = lambda do
      checks += 1
      if checks == 3
        bytes.replace("changed")
        send_id.replace(SECOND)
        attempt_id.replace(SECOND)
      end
      @now
    end
    budget = Elevateo::SendWorker::CallDeadline.new(seconds: 10.0, clock: clock)
    driver = build("accept")
    result = driver.submit(bytes, send_id: send_id, attempt_id: attempt_id, deadline: budget)
    recovered = driver.observation(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: digest)
    assert_equal result.receipt_ref, recovered.receipt_ref
    assert_nil driver.observation(send_id: SECOND, attempt_id: SECOND, snapshot_digest: digest)
  end

  def test_concurrent_duplicate_attempts_reserve_only_one_invocation
    entered, release = Queue.new, Queue.new
    driver = build("pause", pause: -> { entered << true; release.pop })
    worker = Thread.new { submit(driver) }
    entered.pop
    begin
      assert_raises(ArgumentError) { submit(driver) }
      assert_equal 1, driver.invocations
    ensure
      release << true
      worker.join
    end
    assert_equal "unknown", worker.value.kind
  end

  def test_result_validation_and_evidence_digest_do_not_leak_content
    assert_raises(ArgumentError) { Elevateo::SendWorker::SubmissionResult.new(kind: "delivered") }
    assert_raises(ArgumentError) { Elevateo::SendWorker::SubmissionResult.new(kind: "accepted", receipt_ref: "secret") }
    assert_raises(ArgumentError) { Elevateo::SendWorker::SubmissionResult.new(kind: "unknown", code: "raw payload") }
    result = submit(build("accept"))
    evidence = result.evidence_digest(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: digest)
    assert_match(/\A[0-9a-f]{64}\z/, evidence)
    refute_equal evidence, result.evidence_digest(send_id: SEND, attempt_id: SECOND, snapshot_digest: digest)
  end

  def test_call_budget_bounds_and_equality_expiry
    [0.0, -1.0, 10.01, Float::INFINITY, Float::NAN].each do |seconds|
      assert_raises(ArgumentError) { Elevateo::SendWorker::CallDeadline.new(seconds: seconds) }
    end
    budget = deadline
    @now += 9.999
    assert_nil budget.check!
    @now = 110.0
    assert_raises(Elevateo::SendWorker::CallDeadline::Expired) { budget.check! }
  end

  private

  def digest = Digest::SHA256.hexdigest(BYTES)
  def deadline = Elevateo::SendWorker::CallDeadline.new(seconds: 10.0, clock: -> { @now })
  def build(*outcomes, pause: -> {}) = Elevateo::SendWorker::LocalFailureDriver.new(profile: "local", outcomes: outcomes, pause: pause)
  def submit(driver, bytes: BYTES, attempt: ATTEMPT) = driver.submit(bytes, send_id: SEND, attempt_id: attempt, deadline: deadline)
end
