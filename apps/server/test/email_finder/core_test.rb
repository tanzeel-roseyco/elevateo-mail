# frozen_string_literal: true
require "minitest/autorun"
require_relative "../../lib/elevateo/email_finder/core"

class EmailFinderCoreTest < Minitest::Test
  Core = Elevateo::EmailFinder::Core

  def test_role_matches_aliases_but_rejects_other_roles_and_empty_queries
    assert Core.role_matches?("Chief Executive Officer", "CEO")
    assert Core.role_matches?("CEO & founder", "chief executive officer")
    assert Core.role_matches?("Head of Marketing", "head of marketing")
    refute Core.role_matches?("CTO", "CEO")
    refute Core.role_matches?("CEO", "")
  end

  def test_candidates_normalize_accents_and_multipart_names
    values = Core.candidates("Élodie-Anne de la Peña", "example.com")
    assert_equal 10, values.length
    assert_equal "elodieanne.delapena@example.com", values.first.fetch("email")
    assert_equal "strasse", Core.normalize("Straße")
    assert_empty Core.candidates("", "example.com")
    assert_empty Core.candidates("Prince", "example.com")
    assert_equal "john.smith@example.com", Core.candidates("John Michael Smith", "example.com").first.fetch("email")
  end

  def test_candidates_exclude_oversized_addresses
    values = Core.candidates("#{'a' * 100} Doe", "example.com")
    refute_empty values
    assert(values.all? { |value| value.fetch("email").split("@").first.bytesize <= 64 })
    domain = "#{'a' * 63}.#{'b' * 63}.#{'c' * 63}.#{'d' * 61}"
    assert_empty Core.candidates("Jane Doe", domain)
  end

  def test_domain_evidence_outranks_global_pattern
    values = Core.candidates("Jane Doe", "example.com", { "first" => 2 }, { "flast" => 100 })
    assert_equal "jane@example.com", values.first.fetch("email")
    assert_equal ["first.last"], Core.patterns_for("Jane Doe", "jane.doe@example.com")
    assert_empty Core.patterns_for("Jane Doe", "someone@example.com")
  end

  def test_smtp_classification_and_catch_all_are_conservative
    assert_equal "valid", Core.classify(250)
    [550, 551, 553].each { |code| assert_equal "invalid", Core.classify(code) }
    [nil, 251, 421, 450, 500].each { |code| assert_equal "unknown", Core.classify(code) }
    assert Core.blocked?("Poor reputation listed on Spamhaus")
    refute Core.blocked?("Recipient accepted")
    assert_equal 25, Core.catch_all_score(0, 0, 0)
    assert_operator Core.catch_all_score(10, 10, 100), :<, 90
  end

  def test_extracts_obfuscated_emails_and_people_without_foreign_domain
    fixture = File.read(File.join(__dir__, "fixtures", "team.html"))
    assert_equal ["jane.doe@example.com"], Core.extract_emails(Core.node_text(Core.document(fixture)), "example.com")
    assert_equal [{ "name" => "Jane Doe", "title" => "Chief Technology Officer" }], Core.extract_people(fixture)
    assert_empty Core.extract_people("<p>no names here</p>")
    assert_nil Core.person_from_snippet("LinkedIn", "No person")
    assert_empty Core.extract_emails("a..b@example.com .bad@example.com bad.@example.com")
    assert_equal "other", Core.provider(["evilgoogle.com.attacker.org"])
    assert_equal "google_workspace", Core.provider(["aspmx.l.google.com"])
  end
end
