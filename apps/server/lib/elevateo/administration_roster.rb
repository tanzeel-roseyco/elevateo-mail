# frozen_string_literal: true

require "json"

module Elevateo
  # AIDEV-NOTE: Configuration names and titles are display data, never Auth subjects or authority.
  module AdministrationRoster
    KEYS = (1..12).map { |number| format("elev-person-%03d", number) }.freeze
    FIELDS = %w[key display_name title department email auth_user_id enrollment_state proposed_org_role].freeze
    ROLES = %w[organization_owner organization_admin technology_operator sales_lead sales_member security_auditor organization_member].freeze
    IDENTITIES = [
      ["Allan Chan", "CEO", nil, "organization_owner"],
      ["Callum McFarlane", "Senior Partner", nil, "organization_admin"],
      ["Tanzeel Ahmad", "Junior Partner", "technology", "technology_operator"],
      ["Hazem Dwek", "Senior Partner", "technology", "technology_operator"],
      ["Jeison Mulder", "Senior Partner", "technology", "technology_operator"],
      ["Lachlan MacDonald", "Senior Partner", "sales", "sales_lead"],
      ["Thomas Charrier", "Junior Partner", "sales", "sales_member"],
      ["Emil Larsen", "Junior Partner", "cybersecurity", "security_auditor"],
      ["Roy Neven", "Junior Partner", "sales", "sales_member"],
      ["Ben Pantis", "Associate", nil, "organization_member"],
      ["Matthew", "Associate", nil, "organization_member"],
      ["Adria Pros", "Sales representative", "sales", "sales_member"]
    ].freeze
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i

    class Invalid < StandardError; end

    def self.load(path = File.expand_path("../../config/administration/roster.json", __dir__))
      validate(JSON.parse(File.read(path)))
    rescue JSON::ParserError, Errno::ENOENT
      raise Invalid, "invalid administration roster"
    end

    def self.validate(document)
      invalid! unless document.is_a?(Hash) && document.keys.sort == %w[live_activation mailbox_grants people schema_version]
      invalid! unless document["schema_version"] == 1 && document["live_activation"] == false
      invalid! unless document["mailbox_grants"] == [] && document["people"].is_a?(Array)
      people = document["people"]
      invalid! unless people.length == 12 && people.map { |person| person.is_a?(Hash) && person["key"] } == KEYS
      people.each_with_index do |person, index|
        invalid! unless person.keys.sort == FIELDS.sort
        invalid! unless %w[key display_name title].all? { |key| person[key].is_a?(String) && person[key].bytesize.between?(1, 96) }
        invalid! unless person["department"].nil? || %w[technology sales cybersecurity].include?(person["department"])
        invalid! unless person["email"].nil? && person["auth_user_id"].nil? && person["enrollment_state"] == "unbound"
        invalid! unless ROLES.include?(person["proposed_org_role"])
        invalid! unless [person["display_name"], person["title"], person["department"], person["proposed_org_role"]] == IDENTITIES[index]
      end
      document
    end

    # Controlled enrollment only: callers must verify the subject and organization through Sabine's authority routine.
    def self.binding(config_key:, auth_user_id:, existing_bindings:, verified_subject:)
      invalid! unless KEYS.include?(config_key) && verified_subject == auth_user_id
      invalid! unless auth_user_id.is_a?(String) && UUID.match?(auth_user_id)
      invalid! unless existing_bindings.is_a?(Hash) && existing_bindings.keys.all? { |key| KEYS.include?(key) }
      invalid! unless existing_bindings.values.all? { |value| value.is_a?(String) && UUID.match?(value) }
      invalid! if existing_bindings.values.map(&:downcase).include?(auth_user_id.downcase) || existing_bindings.key?(config_key)
      { "key" => config_key, "auth_user_id" => auth_user_id.downcase }
    end

    # Display only: proposed roles are omitted because configuration cannot confer current authority.
    def self.public_people(document)
      validate(document)
      document.fetch("people").map do |person|
        { "key" => person.fetch("key"), "display_name" => person.fetch("display_name"),
          "title" => person.fetch("title"), "department" => person["department"],
          "enrollment_state" => "unbound" }
      end
    end

    def self.invalid! = raise(Invalid, "invalid administration roster")
  end
end
