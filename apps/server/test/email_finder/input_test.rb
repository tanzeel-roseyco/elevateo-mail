# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/email_finder/input"

class EmailFinderInputTest < Minitest::Test
  Input = Elevateo::EmailFinder::Input

  def test_single_lookup_normalizes_domains_and_addresses
    assert_equal({ "name" => "Jane Doe", "domain" => "example.com" }, Input.row("person", { "name" => " Jane Doe ", "domain" => "EXAMPLE.COM." }))
    assert_equal "jane@example.com", Input.row("verify", { "email" => "Jane@Example.com" }).fetch("email")
    assert_equal "jose smith", Input.suppression("person", "José  Smith")
  end

  def test_each_feature_rejects_missing_required_fields
    %w[person verify company decision_maker].each do |kind|
      assert_raises(Elevateo::CollaborationError) { Input.row(kind, {}) }
      assert_raises(Elevateo::CollaborationError) { Input.row(kind, { "unexpected" => "x" }) }
    end
  end

  def test_rejects_smtp_and_csv_injection_and_invalid_domains
    ["x\r\nRCPT TO:<other@example.com>", "name@@example.com", "name@example.com/path", "a..b@example.com"].each do |email|
      assert_raises(Elevateo::CollaborationError) { Input.email(email) }
    end
    assert_raises(Elevateo::CollaborationError) { Input.domain("-bad.example") }
    assert_raises(Elevateo::CollaborationError) { Input.domain("example.com..") }
    assert_raises(Elevateo::CollaborationError) { Input.row("decision_maker", { "company" => "Acme", "role" => "x" * 201 }) }
  end

  def test_csv_accepts_5000_and_rejects_5001_rows
    csv = "email\n" + ("jane@example.com\n" * 5000)
    assert_equal 5000, Input.rows("verify", nil, csv).length
    assert_raises(Elevateo::CollaborationError) { Input.rows("verify", nil, csv + "other@example.com\n") }
  end

  def test_csv_rejects_oversize_duplicate_headers_and_bad_row
    assert_raises(Elevateo::CollaborationError) { Input.rows("verify", nil, "x" * 2_097_153) }
    assert_raises(Elevateo::CollaborationError) { Input.rows("verify", nil, "email,email\na@b.com,c@d.com") }
    assert_raises(Elevateo::CollaborationError) { Input.rows("verify", nil, "email\ninvalid") }
    assert_raises(Elevateo::CollaborationError) { Input.rows("verify", nil, "email\na@b.com,unexpected") }
    assert_raises(Elevateo::CollaborationError) { Input.rows("verify", [], "email\na@b.com") }
  end
end
