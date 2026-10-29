# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/mail_message_identity"

class MailMessageIdentityTest < Minitest::Test
  # AIDEV-NOTE: Imported identity becomes a wire header only after ambiguity and injection checks succeed.
  def test_extracts_one_case_insensitive_identifier_without_rewriting
    assert_equal "<original.1@example.invalid>", identity.from_mime(
      "From: sender@example.invalid\r\nmEsSaGe-Id: <original.1@example.invalid>\r\n\r\nbody")
  end

  def test_missing_duplicate_and_injected_values_are_unavailable
    assert_nil identity.from_mime("Subject: no identifier\r\n\r\nMessage-ID: <body@example.invalid>")
    assert_nil identity.from_mime("Message-ID: <a@example.invalid>\nMessage-ID: <a@example.invalid>\n\nbody")
    refute identity.valid?("<a@example.invalid>\r\nBcc: other@example.invalid")
    refute identity.valid?(nil)
    refute identity.valid?("")
    refute identity.valid?("<a@>")
  end

  def test_identifier_byte_limit_is_inclusive
    assert identity.valid?("<#{'a' * 994}@b>")
    refute identity.valid?("<#{'a' * 995}@b>")
  end

  private

  def identity
    Elevateo::MailMessageIdentity
  end
end
