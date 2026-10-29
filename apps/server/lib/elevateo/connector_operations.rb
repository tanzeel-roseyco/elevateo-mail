# frozen_string_literal: true

require_relative "connector_input"
require_relative "draft_operations"

module Elevateo
  # AIDEV-NOTE: Queries stay inside the grant's guarded tenant transaction; citations never confer authority.
  class ConnectorOperations
    SELECT = "SELECT m.id::text, m.thread_id::text, left(COALESCE(t.subject, ''),998) AS subject, left(m.body_text,65536) AS body_text FROM app.messages m " \
      "JOIN app.threads t ON t.id=m.thread_id AND t.organization_id=m.organization_id AND t.mailbox_id=m.mailbox_id "
    def initialize(connection:, session:)
      @database = Drafts::Database.new(connection: connection, session: session)
      @drafts = DraftOperations.new(connection: connection, session: session)
    end

    def search(input)
      mailbox = WriteInput.uuid(input["mailbox_id"])
      query = WriteInput.text(input["query"], maximum: 200)
      limit = input["limit"]
      WriteInput.invalid! unless limit.is_a?(Integer) && limit.between?(1, 50)
      # AIDEV-NOTE: strpos makes '%' and '_' literal; bound the result before projecting untrusted message text.
      rows = @database.rows(SELECT + "WHERE m.mailbox_id=$1::uuid AND " \
        "(strpos(lower(t.subject),lower($2::text))>0 OR strpos(lower(m.body_text),lower($2::text))>0) " \
        "ORDER BY m.sent_at DESC NULLS LAST,m.id DESC LIMIT $3::integer", [mailbox, query, (limit + 1).to_s])
      # AIDEV-NOTE: Count escaped UTF-8 bytes, not characters, leaving room for the response envelope.
      # @type var messages: Array[ReadResponse::item]
      messages = []
      bytes = 0
      rows.first(limit).each do |row|
        item = message(row, mailbox)
        bytes += JSON.generate(item).bytesize + 1
        break if bytes > 4_193_280
        messages << item
      end
      { "messages" => messages, "truncated" => messages.length < rows.length }
    end

    def read(input)
      mailbox = WriteInput.uuid(input["mailbox_id"])
      row = @database.rows(SELECT + "WHERE m.mailbox_id=$1::uuid AND m.thread_id=$2::uuid AND m.id=$3::uuid",
        [mailbox, WriteInput.uuid(input["thread_id"]), WriteInput.uuid(input["message_id"])]).first
      raise CollaborationError.new("not_available") unless row
      message(row, mailbox)
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
      WriteResponse.new(json: @database.encode(value, budget: 4_194_304), status: 200)
    end

    private

    def message(row, mailbox)
      thread = WriteInput.uuid(row["thread_id"])
      id = WriteInput.uuid(row["id"])
      subject = row["subject"]
      body = row["body_text"]
      raise CollaborationError.new("internal_error") unless subject.is_a?(String) && body.is_a?(String)
      { "citation" => { "mailbox_id" => mailbox, "thread_id" => thread, "message_id" => id,
          "uri" => "elevateo://mailboxes/#{mailbox}/threads/#{thread}/messages/#{id}" },
        "subject" => subject[0, 998], "text" => body[0, 65_536], "untrusted_content" => true }
    end
  end
end
