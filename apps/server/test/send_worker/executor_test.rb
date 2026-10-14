# frozen_string_literal: true

require "minitest/autorun"
require "digest"
require_relative "../../lib/elevateo/send_worker/executor"
require_relative "../../lib/elevateo/send_worker/local_failure_driver"

class SendWorkerExecutorTest < Minitest::Test
  SEND_ID = "11111111-1111-4111-8111-111111111111"
  ATTEMPT_ID = "22222222-2222-4222-8222-222222222222"
  EPOCH = "33333333-3333-4333-8333-333333333333"
  BYTES = '["elevateo.send.snapshot.v1","fixture"]'
  Claim = Struct.new(:send_id, :action, :attempt_id, :snapshot_digest, keyword_init: true)
  Authorization = Struct.new(:attempt_id, :snapshot_bytes, keyword_init: true)

  class Store
    attr_accessor :claim_value, :authorization, :observation, :reconciled, :final_allowed
    attr_reader :authorization_calls, :unknown_calls

    def initialize(claim_value:, authorization:)
      @claim_value, @authorization = claim_value, authorization
      @authorization_calls = 0
      @unknown_calls = 0
      @final_allowed = true
    end

    def claim(epoch:) = @claim_value

    def authorize_submission(claim:, epoch:)
      @authorization_calls += 1
      @authorization
    end

    def record_observation(claim:, attempt_id:, snapshot_digest:, result:)
      @observation = result
    end

    def final_check(claim:, attempt_id:, epoch:) = @final_allowed

    def reconcile(claim:, observation:) = (@reconciled = observation)

    def mark_unknown(claim:, attempt_id:, reason:) = (@unknown_calls += 1)
  end

  def setup
    @state = Elevateo::SendWorker::ControlState.new(epoch: EPOCH, outbound_held: false)
    @control = Object.new
    state = @state
    @control.define_singleton_method(:read) { state }
    @driver = Elevateo::SendWorker::LocalFailureDriver.new(profile: "local", outcomes: ["accept_then_timeout"])
    @store = Store.new(claim_value: Claim.new(send_id: SEND_ID, action: "submit"),
      authorization: Authorization.new(attempt_id: ATTEMPT_ID, snapshot_bytes: BYTES))
  end

  def test_lost_acceptance_is_reconciled_without_second_submission
    assert_equal :unknown, executor.run_once
    assert_equal 1, @driver.invocations
    assert_equal "unknown", @store.observation.kind
    @store.claim_value = Claim.new(send_id: SEND_ID, action: "reconcile", attempt_id: ATTEMPT_ID,
      snapshot_digest: Digest::SHA256.hexdigest(BYTES))
    assert_equal :accepted, executor.run_once
    assert_equal "accepted", @store.reconciled.kind
    assert_equal 1, @driver.invocations
  end

  def test_revoked_grant_blocks_submission
    @store.authorization = nil
    assert_equal :held, executor.run_once
    assert_equal 0, @driver.invocations
    assert_equal 0, @store.unknown_calls
    assert_equal 1, @store.authorization_calls
  end

  def test_cancellation_between_authorization_and_call_blocks_submission
    @store.final_allowed = false
    assert_equal :held, executor.run_once
    assert_equal 0, @driver.invocations
    assert_equal 1, @store.unknown_calls
  end

  def test_duplicate_claim_never_creates_second_attempt
    assert_equal :unknown, executor.run_once
    assert_raises(ArgumentError) { executor.run_once }
    assert_equal 1, @driver.invocations
  end

  private

  def executor
    Elevateo::SendWorker::Executor.new(store: @store, driver: @driver, control: @control,
      deadline_factory: -> { Elevateo::SendWorker::CallDeadline.new(seconds: 10) })
  end
end
