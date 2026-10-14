# frozen_string_literal: true

require "pg"
require "uri"

module Elevateo
  module AttachmentGateway
    class Denied < StandardError; end
    class Unavailable < StandardError; end

    # AIDEV-NOTE: The dedicated login has only EXECUTE on one complete authorization and binding helper.
    class Authority
      def initialize(gateway_database_url:, database_name:)
        @database_name = database_name
        @connection_options = connection_options(gateway_database_url)
      end

      def clean_binding(claim)
        connection = PG.connect(**@connection_options)
        identity = connection.exec("SELECT session_user, current_database()").first
        raise Denied unless identity == { "session_user" => "elevateo_attachment_gateway",
                                       "current_database" => @database_name }
        connection.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
        connection.exec("SET LOCAL statement_timeout = '3s'")
        connection.exec("SET LOCAL lock_timeout = '1s'")
        row = connection.exec_params(<<~SQL, arguments(claim)).first
          SELECT storage_key, byte_size, sha256, content_type, filename
          FROM app_attachment_gateway.private_binding($1::text,$2::uuid,$3::uuid,$4::uuid,$5::bigint,
            $6::uuid,$7::text,$8::uuid,$9::uuid,$10::uuid,$11::uuid,$12::uuid)
        SQL
        connection.exec("COMMIT")
        raise Denied unless row
        row.freeze
      rescue PG::Error
        raise Unavailable
      ensure
        connection&.finish unless connection&.finished?
      end

      private

      def connection_options(url)
        uri = URI.parse(url)
        raise ArgumentError, "invalid private database URL" unless %w[postgres postgresql].include?(uri.scheme) &&
          uri.host == "db" && uri.port == 5432 && uri.path == "/#{@database_name}" &&
          uri.user == "elevateo_attachment_gateway" && uri.password && !uri.password.empty? &&
          uri.query.nil? && uri.fragment.nil?
        { host: "db", port: 5432, dbname: @database_name, user: uri.user,
          password: URI::DEFAULT_PARSER.unescape(uri.password), connect_timeout: 3 }.freeze
      rescue URI::InvalidURIError
        raise ArgumentError, "invalid private database URL"
      end

      def arguments(claim)
        %w[session_digest expected_user_id expected_auth_session_id context_uuid authorization_generation
           context_id authorization_version attachment_id organization_id mailbox_id thread_id message_id]
          .map { |key| claim.fetch(key) }
      rescue KeyError
        raise Denied
      end
    end
  end
end
