# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/send_worker/smtp_profile"

class SendWorkerSmtpProfileTest < Minitest::Test
  def test_local_profile_is_exact_mailpit_with_synthetic_sender
    profile = Elevateo::SendWorker::SmtpProfile.local_mailpit(verified_sender: "sender@example.invalid")
    assert profile.local_test?
    refute profile.held?
    assert_equal "mailpit-smtp-test-v1", profile.mode
    assert_equal "mailpit", profile.host
    assert_nil profile.credential_ref
  end

  def test_remote_profile_is_typed_but_held
    profile = Elevateo::SendWorker::SmtpProfile.remote_held(host: "smtp.example.com", port: 587,
      verified_sender: "sender@example.com", tls_mode: "starttls_required", credential_ref: "secret://mailbox_1")
    assert profile.held?
    assert_equal "starttls_required", profile.tls_mode
    assert_equal "secret://mailbox_1", profile.credential_ref
  end

  def test_remote_weak_tls_and_local_real_sender_are_rejected
    assert_raises(ArgumentError) do
      Elevateo::SendWorker::SmtpProfile.remote_held(host: "smtp.example.com", port: 587,
        verified_sender: "sender@example.com", tls_mode: "none", credential_ref: "secret://mailbox_1")
    end
    assert_raises(ArgumentError) do
      Elevateo::SendWorker::SmtpProfile.local_mailpit(verified_sender: "sender@example.com")
    end
    assert_raises(ArgumentError) do
      Elevateo::SendWorker::SmtpProfile.remote_held(host: "127.0.0.1", port: 465,
        verified_sender: "sender@example.com", tls_mode: "implicit", credential_ref: "secret://mailbox_1")
    end
  end
end
