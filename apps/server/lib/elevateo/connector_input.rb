# frozen_string_literal: true

require_relative "write_input"
require_relative "drafts/payload"

module Elevateo
  # AIDEV-NOTE: Browser grants and bearer operations share exact field validation; no email text controls scopes.
  module ConnectorInput
    GRANT_FIELDS = %w[mailbox_id client scopes expires_in_seconds].freeze
    SEARCH_FIELDS = %w[mailbox_id query limit].freeze
    READ_FIELDS = %w[mailbox_id thread_id message_id].freeze
    DRAFT_FIELDS = (Drafts::Payload::FIELDS + %w[draft_id citations]).freeze

    def self.grant(input)
      WriteInput.invalid! unless input.keys.sort == GRANT_FIELDS.sort
      WriteInput.uuid(input["mailbox_id"])
      WriteInput.invalid! unless %w[codex claude].include?(input["client"])
      scopes = input["scopes"]
      WriteInput.invalid! unless scopes.is_a?(Array) && scopes.length.between?(1, 3) &&
        scopes.uniq.length == scopes.length && scopes.all? { |scope| %w[search read draft].include?(scope) }
      seconds = input["expires_in_seconds"]
      WriteInput.invalid! unless seconds.is_a?(Integer) && seconds.between?(60, 86_400)
      input
    end

    def self.operation(name, input)
      fields = case name
      when "search" then SEARCH_FIELDS
      when "read" then READ_FIELDS
      when "draft" then DRAFT_FIELDS
      else WriteInput.invalid!
      end
      WriteInput.invalid! unless input.keys.sort == fields.sort
      WriteInput.uuid(input["mailbox_id"])
      if name == "search"
        WriteInput.text(input["query"], maximum: 200)
        limit = input["limit"]
        WriteInput.invalid! unless limit.is_a?(Integer) && limit.between?(1, 50)
      elsif name == "read"
        WriteInput.uuid(input["thread_id"])
        WriteInput.uuid(input["message_id"])
      else
        expected = input["expected_version"]
        WriteInput.invalid! unless expected.is_a?(Integer) && expected.between?(0, 2_147_483_646)
        Drafts::Payload.new(draft_id: WriteInput.uuid(input["draft_id"]), input: input.slice(*Drafts::Payload::FIELDS))
        citations(input["citations"], WriteInput.uuid(input["mailbox_id"]))
      end
      input
    end

    def self.citations(value, mailbox)
      WriteInput.invalid! unless value.is_a?(Array) && value.length <= 50
      value.map do |item|
        WriteInput.invalid! unless item.is_a?(Hash) && item.keys.sort == %w[mailbox_id message_id thread_id uri]
        owner = WriteInput.uuid(item["mailbox_id"])
        thread = WriteInput.uuid(item["thread_id"])
        message = WriteInput.uuid(item["message_id"])
        uri = "elevateo://mailboxes/#{owner}/threads/#{thread}/messages/#{message}"
        WriteInput.invalid! unless owner == mailbox && item["uri"] == uri
        { "mailbox_id" => owner, "thread_id" => thread, "message_id" => message, "uri" => uri }
      end
    end
  end
end
