# frozen_string_literal: true

require_relative "request_deadline"

module Elevateo
  # AIDEV-NOTE: Ruby callers are interruptible; only materialized SQL calls defer the request's timeout.
  class WriteStatements
    def initialize(connection, deadline)
      @connection, @deadline = connection, deadline
    end

    def exec_query(sql, name, binds)
      Thread.handle_interrupt(RequestDeadline::Expired => :never) do
        @deadline.check!
        result = @connection.exec_query(sql, name, binds)
        @deadline.check!
        result
      end
    end
  end
end
