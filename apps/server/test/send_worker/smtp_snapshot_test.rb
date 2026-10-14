# frozen_string_literal: true

require "minitest/autorun"
require "json"
require_relative "../../lib/elevateo/send_worker/smtp_snapshot"
require_relative "../../lib/elevateo/send_api/canonical"

class SendWorkerSmtpSnapshotTest < Minitest::Test
  SEND_ID = "11111111-1111-4111-8111-111111111111"
  ORG = "22222222-2222-4222-8222-222222222222"
  BOX = "33333333-3333-4333-8333-333333333333"
  DRAFT = "44444444-4444-4444-8444-444444444444"
  SENDER = "sender@example.invalid"

  def snapshot
    Elevateo::SendAPI::Canonical.bytes(organization_id: ORG, mailbox_id: BOX, draft_id: DRAFT,
      version: 1, sender: SENDER, recipients: [{ "display_name" => "José", "address" => "recipient@example.invalid" }],
      subject: "Hello / Ö", body: "line one\nline two", reply_id: nil, policy: "1")
  end

  def test_plain_text_mime_is_deterministic_and_bounded
    first = render(snapshot)
    second = render(snapshot)
    assert_equal first.mime, second.mime
    assert_equal SENDER, first.sender
    assert_equal ["recipient@example.invalid"], first.recipients
    assert_includes first.mime, "Content-Type: text/plain; charset=UTF-8\r\n"
    assert_includes first.mime, "Content-Transfer-Encoding: base64\r\n"
    refute_includes first.mime, "line one\nline two"
    assert_operator first.mime.bytesize, :<=, Elevateo::SendWorker::SmtpSnapshot::MAX_MIME_BYTES
  end

  def test_unverified_sender_and_header_injection_are_rejected
    assert_raises(Elevateo::SendWorker::SmtpSnapshot::Invalid) do
      Elevateo::SendWorker::SmtpSnapshot.render(snapshot, send_id: SEND_ID,
        verified_sender: "other@example.invalid")
    end
    value = JSON.parse(snapshot)
    value[7] = "safe\r\nBcc: stolen@example.invalid"
    assert_raises(Elevateo::SendWorker::SmtpSnapshot::Invalid) { render(JSON.generate(value)) }
  end

  def test_attachments_and_oversized_body_fail_closed
    value = JSON.parse(snapshot)
    value[12] = ["unapproved"]
    assert_raises(Elevateo::SendWorker::SmtpSnapshot::Invalid) { render(JSON.generate(value)) }
    value[12] = []
    value[8] = "a" * (Elevateo::SendWorker::SmtpSnapshot::MAX_BODY_CHARS + 1)
    assert_raises(Elevateo::SendWorker::SmtpSnapshot::Invalid) { render(JSON.generate(value)) }
  end

  private

  def render(bytes)
    Elevateo::SendWorker::SmtpSnapshot.render(bytes, send_id: SEND_ID, verified_sender: SENDER)
  end
end
