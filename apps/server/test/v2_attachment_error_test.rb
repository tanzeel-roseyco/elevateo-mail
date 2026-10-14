# frozen_string_literal: true

require "minitest/autorun"
require_relative "../lib/elevateo/collaboration_error"

class V2AttachmentErrorTest < Minitest::Test
  def test_authorized_held_attachment_has_fixed_423_envelope
    error = Elevateo::CollaborationError.new("attachment_held")
    assert_equal 423, error.status
    assert_equal({ "code" => "attachment_held", "message" => "Attachment is not available yet",
      "request_id" => "request-1" }, error.body("request-1"))
  end

  def test_absent_or_foreign_attachment_keeps_non_enumerating_404
    error = Elevateo::CollaborationError.new("not_available")
    assert_equal 404, error.status
    refute_equal "attachment_held", error.code
  end

  def test_unknown_error_code_is_rejected
    assert_raises(KeyError) { Elevateo::CollaborationError.new("attachment_unknown") }
  end
end
