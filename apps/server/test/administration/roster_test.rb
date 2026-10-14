# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/administration_roster"

class AdministrationRosterTest < Minitest::Test
  Roster = Elevateo::AdministrationRoster
  USER_ID = "00000000-0000-4000-8000-000000000001"

  def test_exact_unbound_configuration_and_verified_binding
    roster = Roster.load
    assert_equal 12, roster.fetch("people").size
    assert_equal "Matthew", roster.fetch("people")[10].fetch("display_name")
    assert roster.fetch("people").all? { |person| person["email"].nil? && person["auth_user_id"].nil? }
    assert_equal({ "key" => "elev-person-001", "auth_user_id" => USER_ID },
      Roster.binding(config_key: "elev-person-001", auth_user_id: USER_ID, existing_bindings: {}, verified_subject: USER_ID))
  end

  def test_rejects_unknown_or_duplicate_identity
    assert_raises(Roster::Invalid) { Roster.binding(config_key: "elev-person-013", auth_user_id: USER_ID, existing_bindings: {}, verified_subject: USER_ID) }
    assert_raises(Roster::Invalid) do
      Roster.binding(config_key: "elev-person-002", auth_user_id: USER_ID,
        existing_bindings: { "elev-person-001" => USER_ID }, verified_subject: USER_ID)
    end
  end

  def test_rejects_unverified_subject_and_forged_configuration
    assert_raises(Roster::Invalid) { Roster.binding(config_key: "elev-person-001", auth_user_id: USER_ID, existing_bindings: {}, verified_subject: nil) }
    roster = Roster.load
    roster.fetch("people")[10]["display_name"] = "Matthew Invented"
    assert_raises(Roster::Invalid) { Roster.validate(roster) }
  end
end
