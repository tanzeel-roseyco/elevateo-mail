# frozen_string_literal: true

require "active_record"
require "timeout"
require_relative "state"
require_relative "storage"
require_relative "../../../apps/server/lib/elevateo/tenancy"
require_relative "../../../apps/server/test/be_01_r1/authority_guards"

module Be01Services
  # AIDEV-NOTE: Fixture-only adapter; DB-resolved locator and closed tenant transaction precede privileged HTTP.
  class AuthorizedStorage
    class Denied < StandardError; end

    def initialize(storage, connection)
      @storage, @connection = storage, connection
    end

    def read(principal, mailbox)
      Be01Services.expect(State::UUID.match?(mailbox), "requested mailbox UUID")
      path = Elevateo::Tenancy.with_context(principal, connection: @connection) do |connection|
        bind = ActiveRecord::Relation::QueryAttribute.new("mailbox", mailbox, ActiveRecord::Type::String.new)
        rows = connection.exec_query("SELECT storage_object_path FROM app.mailboxes WHERE id=$1", "fixture", [bind])
        raise Denied, "mailbox denied" unless rows.length == 1
        rows.first.fetch("storage_object_path")
      end
      Be01Services.expect(!@connection.transaction_open?, "HTTP outside tenant transaction")
      @storage.read(path)
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    Timeout.timeout(60) do
      Be01Services.expect(!ENV.key?("POSTGRES_PASSWORD") && !ENV.key?("MIGRATOR_DB_PASSWORD"), "no admin secrets")
      ActiveRecord::Base.establish_connection(adapter: "postgresql", host: "db", database: "postgres",
        username: "elevateo_api", password: ENV.fetch("API_DB_PASSWORD"), pool: 1, connect_timeout: 3,
        variables: { statement_timeout: 5000, lock_timeout: 2000 })
      connection = ActiveRecord::Base.connection
      Object.new.extend(R1AuthorityGuards).guard_authority(connection, "repair")
      data = Be01Services::State.load
      ids = Be01Services::State.identities
      storage = Be01Services::Storage.new(ENV.fetch("SERVICE_ROLE_KEY"), "be01-#{data.fetch('nonce')}", data.fetch("mailbox"))
      adapter = Be01Services::AuthorizedStorage.new(storage, connection)
      owner, outsider = ids.map { |id| Elevateo::Tenancy::Principal.new(user_id: id, org_id: data.fetch("org")) }
      Be01Services.expect(adapter.read(owner, data.fetch("mailbox")) == Be01Services::State.bytes(data), "authorized bytes")
      begin
        adapter.read(outsider, data.fetch("mailbox"))
        raise Be01Services::Failure, "outsider unexpectedly authorized"
      rescue Be01Services::AuthorizedStorage::Denied
        Be01Services.expect(!connection.transaction_open?, "denial transaction closed")
      end
      puts "PASS restricted real-identity Storage adapter; outsider denied"
    end
  rescue StandardError => error
    warn "FAIL authorized Storage fixture (#{error.class.name})"
    exit 1
  ensure
    ActiveRecord::Base.connection_pool.disconnect! if ActiveRecord::Base.connected?
  end
end
