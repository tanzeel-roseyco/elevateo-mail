# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "digest"
require_relative "../../lib/elevateo/send_worker/durable_local_driver"

class DurableLocalDriverTest < Minitest::Test
  SEND_ID = "11111111-1111-4111-8111-111111111111"
  ATTEMPT_ID = "22222222-2222-4222-8222-222222222222"
  BYTES = '["elevateo.send.snapshot.v1","fixture"]'

  def with_driver(outcome)
    Dir.mktmpdir("local-acceptance-") do |dir|
      path = File.join(dir, "ledger.jsonl")
      yield Elevateo::SendWorker::DurableLocalDriver.new(path: path, outcome: outcome), path
    end
  end

  def deadline = Elevateo::SendWorker::CallDeadline.new(seconds: 10)

  def test_lost_response_survives_new_driver_instance
    with_driver("accept_then_timeout") do |driver, path|
      result = driver.submit(BYTES, send_id: SEND_ID, attempt_id: ATTEMPT_ID, deadline: deadline)
      assert_equal "unknown", result.kind
      later = Elevateo::SendWorker::DurableLocalDriver.new(path: path, outcome: "reject")
      observed = later.observation(send_id: SEND_ID, attempt_id: ATTEMPT_ID,
        snapshot_digest: Digest::SHA256.hexdigest(BYTES))
      assert_equal "accepted", observed.kind
      assert_match(/\Alocal:[0-9a-f]{64}\z/, observed.receipt_ref)
      assert_raises(ArgumentError) do
        later.submit(BYTES, send_id: SEND_ID, attempt_id: ATTEMPT_ID, deadline: deadline)
      end
    end
  end

  def test_changed_binding_cannot_observe_or_resubmit
    with_driver("accept") do |driver, path|
      driver.submit(BYTES, send_id: SEND_ID, attempt_id: ATTEMPT_ID, deadline: deadline)
      later = Elevateo::SendWorker::DurableLocalDriver.new(path: path, outcome: "accept")
      assert_nil later.observation(send_id: SEND_ID, attempt_id: ATTEMPT_ID,
        snapshot_digest: Digest::SHA256.hexdigest("changed"))
      assert_raises(ArgumentError) do
        later.submit("changed", send_id: SEND_ID,
          attempt_id: "33333333-3333-4333-8333-333333333333", deadline: deadline)
      end
    end
  end

  def test_corrupt_ledger_fails_closed
    with_driver("accept") do |driver, path|
      File.write(path, "{broken\n")
      File.chmod(0o600, path)
      assert_raises(ArgumentError) do
        driver.submit(BYTES, send_id: SEND_ID, attempt_id: ATTEMPT_ID, deadline: deadline)
      end
    end
  end
end
