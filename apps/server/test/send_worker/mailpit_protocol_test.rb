# frozen_string_literal: true

require "minitest/autorun"
require "json"
require "net/http"
require "securerandom"
require_relative "../../lib/elevateo/send_worker/smtp_transport"
require_relative "../../lib/elevateo/send_api/canonical"

# AIDEV-NOTE: Run only in Soren's isolated fleet Docker network with pinned internal Mailpit and no relay.
class SendWorkerMailpitProtocolTest < Minitest::Test
  def test_plain_text_snapshot_reaches_only_internal_mailpit
    skip "fleet-only Mailpit protocol gate" unless ENV["SEND811_MAILPIT_PROTOCOL"] == "true"
    send_id = SecureRandom.uuid
    recipient = "#{SecureRandom.hex(8)}@example.invalid"
    sender = "sender@example.invalid"
    snapshot = Elevateo::SendAPI::Canonical.bytes(organization_id: SecureRandom.uuid,
      mailbox_id: SecureRandom.uuid, draft_id: SecureRandom.uuid, version: 1, sender: sender,
      recipients: [{ "display_name" => nil, "address" => recipient }], subject: "Isolated protocol",
      body: "plain text only", reply_id: nil, policy: "1")
    profile = Elevateo::SendWorker::SmtpProfile.local_mailpit(verified_sender: sender)
    transport = Elevateo::SendWorker::SmtpTransport.new(profile: profile)
    result = transport.submit(snapshot, send_id: send_id, attempt_id: SecureRandom.uuid,
      deadline: Elevateo::SendWorker::CallDeadline.new(seconds: 10.0))
    assert_equal "accepted", result.kind
    assert result.simulated?
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
    loop do
      response = Net::HTTP.start("mailpit", 8025, open_timeout: 2, read_timeout: 2) do |http|
        http.get("/api/v1/messages?limit=50")
      end
      assert_equal "200", response.code
      list = JSON.parse(response.body)
      matched = list.fetch("messages").find do |message|
        message.fetch("To").any? { |address| address.fetch("Address") == recipient }
      end
      if matched
        detail = Net::HTTP.start("mailpit", 8025, open_timeout: 2, read_timeout: 2) do |http|
          http.get("/api/v1/message/#{matched.fetch('ID')}")
        end
        assert_equal "200", detail.code
        message = JSON.parse(detail.body)
        assert_equal "plain text only", message.fetch("Text").strip
        assert_equal "", message.fetch("HTML").to_s
        break
      end
      raise "Mailpit did not capture isolated message" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep 0.1
    end
  end
end
