# frozen_string_literal: true

require "minitest/autorun"
require "stringio"
require "tmpdir"
require_relative "../../lib/elevateo/write_input"
require_relative "../../lib/elevateo/send_worker/control"
require_relative "../../lib/elevateo/send_worker/submission_result"

class QA817AdversarialBoundariesTest < Minitest::Test
  EPOCH = "a1111111-1111-4111-8111-111111111111"
  DIGEST = "a" * 64

  def test_exact_origin_and_closed_json_accept_bounded_plaintext
    Elevateo::WriteInput.transport!(origin: "https://app.test", expected_origin: "https://app.test",
      content_type: "application/json", content_encoding: "identity", body: true)
    value = Elevateo::WriteInput.body('{"body_text":"<script>\u2028hello"}', required: ["body_text"])
    assert_equal "<script>\u2028hello", value.fetch("body_text")
    assert_equal "<script>\u2028hello", Elevateo::WriteInput.text(value.fetch("body_text"), maximum: 14)
  end

  def test_cross_origin_and_forged_media_are_rejected
    ["https://app.test.evil", "null", "https://app.test/"].each do |origin|
      invalid_request do
        Elevateo::WriteInput.transport!(origin: origin, expected_origin: "https://app.test",
          content_type: "application/json", content_encoding: nil, body: true)
      end
    end
    invalid_request do
      Elevateo::WriteInput.transport!(origin: "https://app.test", expected_origin: "https://app.test",
        content_type: "text/plain", content_encoding: nil, body: true)
    end
  end

  def test_hostile_json_and_actual_byte_cap_fail_before_domain_use
    ['{"body_text":"ok","body_text":"stolen"}', '{"body_text":"\u0000"}',
      '{"body_text":{"secret":"x"}}'].each do |raw|
      invalid_request do
        value = Elevateo::WriteInput.body(raw, required: ["body_text"])
        Elevateo::WriteInput.text(value.fetch("body_text"), maximum: 14)
      end
    end
    assert_equal "a" * 8, Elevateo::WriteInput.read(StringIO.new("a" * 8), maximum: 8)
    invalid_request { Elevateo::WriteInput.read(StringIO.new("a" * 9), maximum: 8) }
  end

  def test_worker_control_rejects_hostile_file_and_keeps_release_explicit
    Dir.mktmpdir("qa817-control-") do |directory|
      path = File.join(directory, "control.json")
      control = Elevateo::SendWorker::Control.new(path: path)
      assert_held(control)
      File.binwrite(path, JSON.generate({ "epoch" => EPOCH, "outbound_held" => false }))
      assert control.read.submission_allowed?
      ['{"epoch":"' + EPOCH + '","outbound_held":false,"outbound_held":true}',
        JSON.generate({ "epoch" => EPOCH, "outbound_held" => "false" }),
        "x" * 4097, "\xFF".b].each do |bytes|
        File.binwrite(path, bytes)
        assert_held(control)
      end
    end
  end

  def test_simulated_receipts_are_closed_and_evidence_is_binding_specific
    accepted = Elevateo::SendWorker::SubmissionResult.new(kind: "accepted", receipt_ref: "local:" + DIGEST)
    assert accepted.simulated?
    first = accepted.evidence_digest(send_id: EPOCH, attempt_id: EPOCH, snapshot_digest: DIGEST)
    refute_equal first, accepted.evidence_digest(send_id: EPOCH, attempt_id: DIGEST, snapshot_digest: DIGEST)
    [{ kind: "accepted", receipt_ref: "smtp:" + DIGEST },
      { kind: "accepted", receipt_ref: "local:" + DIGEST, code: "local_rejected" },
      { kind: "unknown", code: "accepted" }].each do |input|
      assert_raises(ArgumentError) { Elevateo::SendWorker::SubmissionResult.new(**input) }
    end
  end

  private

  def invalid_request
    assert_equal "request_invalid", assert_raises(Elevateo::CollaborationError) { yield }.code
  end

  def assert_held(control)
    refute control.read.submission_allowed?
    assert control.read.outbound_held
  end
end
