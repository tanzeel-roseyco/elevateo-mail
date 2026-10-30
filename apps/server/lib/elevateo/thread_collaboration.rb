# frozen_string_literal: true

require_relative "thread_projection"
require_relative "write_response"

module Elevateo
  # AIDEV-NOTE: Services use the caller's protected transaction; this shared boundary never opens another one.
  class ThreadCollaboration
    MAX_VERSION = 2_147_483_647
    RESOURCE_SQL = <<~SQL.freeze
      SELECT id FROM app.threads
       WHERE organization_id = $1::uuid AND mailbox_id = $2::uuid AND id = $3::uuid LIMIT 1
    SQL

    def initialize(connection:, identity:, session:)
      @connection, @identity, @session = connection, identity, session
    end

    def self.keys!(input, required)
      WriteInput.invalid! unless input.keys.sort == required.sort
    end

    protected

    def rows(sql, values)
      binds = values.map do |value|
        ActiveRecord::Relation::QueryAttribute.new("collaboration", value, ActiveRecord::Type::String.new)
      end
      @connection.exec_query(sql, "Thread collaboration", binds).to_a
    end

    def resource!(thread, mailbox)
      if rows(RESOURCE_SQL, [@identity.org_id, mailbox, thread]).empty?
        raise CollaborationError.new("not_available")
      end
    end

    def envelope(thread, mailbox)
      context = %w[context_id authorization_version].to_h do |key|
        value = @session[key]
        unless value.is_a?(String) && value.ascii_only? && Cursors::TOKEN.match?(value)
          raise ReadResponse::Invalid, "invalid collaboration response"
        end
        [key, value]
      end
      context.merge("thread_id" => thread, "mailbox_id" => mailbox)
    end

    def serialized(value, budget: 4096)
      # AIDEV-NOTE: Domain projection fixes output fields; WriteResponse validates JSON before the transaction commits.
      json = JSON.generate(value, allow_nan: false, max_nesting: 32)
      raise ReadResponse::Overflow, "collaboration response too large" if json.bytesize > budget

      json
    rescue JSON::GeneratorError, JSON::NestingError, EncodingError
      raise ReadResponse::Invalid, "invalid collaboration response"
    end

    def response(value, status: 200, budget: 4096)
      WriteResponse.new(json: serialized(value, budget: budget), status: status)
    end

    def version(row, key)
      ThreadProjection.integer(row[key], MAX_VERSION)
    end

    def advance!(current)
      raise CollaborationError.new("temporarily_unavailable") if current == MAX_VERSION
    end
  end
end
