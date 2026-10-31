# frozen_string_literal: true

require "active_record"
require "json"
require_relative "../write_input"
require_relative "../read_response"
require_relative "../collaboration_error"

module Elevateo
  module Mailbox
    # AIDEV-NOTE: DTO reads reuse the caller's guarded connection; this API never opens a new RLS transaction.
    class MessageSnapshots
      SELECT = "SELECT m.id::text, m.thread_id::text, left(COALESCE(t.subject, ''),998) AS subject, left(m.body_text,65536) AS body_text FROM app.messages m " \
        "JOIN app.threads t ON t.id=m.thread_id AND t.organization_id=m.organization_id AND t.mailbox_id=m.mailbox_id "
      private_constant :SELECT

      def initialize(connection:)
        @connection = connection
      end

      def search(input)
        mailbox = WriteInput.uuid(input["mailbox_id"])
        query = WriteInput.text(input["query"], maximum: 200)
        limit = input["limit"]
        WriteInput.invalid! unless limit.is_a?(Integer) && limit.between?(1, 50)
        # AIDEV-NOTE: strpos makes '%' and '_' literal; bound the result before projecting untrusted message text.
        rows = rows(SELECT + "WHERE m.mailbox_id=$1::uuid AND " \
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
        row = rows(SELECT + "WHERE m.mailbox_id=$1::uuid AND m.thread_id=$2::uuid AND m.id=$3::uuid",
          [mailbox, WriteInput.uuid(input["thread_id"]), WriteInput.uuid(input["message_id"])]).first
        raise CollaborationError.new("not_available") unless row
        message(row, mailbox)
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
      def rows(sql, values)
        binds = values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new("snapshot", value, ActiveRecord::Type::String.new)
        end
        @connection.exec_query(sql, "Mailbox snapshot", binds).to_a
      end
    end
  end
end
