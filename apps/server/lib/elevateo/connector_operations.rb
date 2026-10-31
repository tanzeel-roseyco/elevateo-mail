# frozen_string_literal: true

require_relative "connector_input"
require_relative "draft_operations"
require_relative "mailbox/message_snapshots"

module Elevateo
  # AIDEV-NOTE: Mailbox DTO reads stay in the grant transaction; citations never confer authority.
  class ConnectorOperations
    def initialize(connection:, session:)
      @messages = Mailbox::MessageSnapshots.new(connection: connection)
      @drafts = DraftOperations.new(connection: connection, session: session)
    end

    def search(input)
      @messages.search(input)
    end

    def read(input)
      @messages.read(input)
    end

    def draft(input, digest:, request_id:)
      mailbox = WriteInput.uuid(input["mailbox_id"])
      citations = ConnectorInput.citations(input["citations"], mailbox)
      # AIDEV-NOTE: Re-read every cited message under current RLS, so fabricated and revoked citations fail closed.
      citations.each { |citation| read(citation.slice("mailbox_id", "thread_id", "message_id")) }
      payload = Drafts::Payload.new(draft_id: WriteInput.uuid(input["draft_id"]), input: input.slice(*Drafts::Payload::FIELDS))
      response = @drafts.save(payload, session_digest: digest, request_id: request_id)
      return response unless response.status == 200
      result = ThreadProjection.source_json(response.json, 4096)
      raise CollaborationError.new("internal_error") unless result.is_a?(Hash)
      encode({ "draft_id" => payload.draft_id, "version" => result.fetch("version"),
        "status" => "draft", "citations" => citations })
    end

    def encode(value)
      json = JSON.generate(value, allow_nan: false)
      raise ReadResponse::Overflow, "draft response exceeds budget" if json.bytesize > 4_194_304
      WriteResponse.new(json: json, status: 200)
    end
  end
end
