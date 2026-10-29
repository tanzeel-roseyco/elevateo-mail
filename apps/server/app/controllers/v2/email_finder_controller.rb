# frozen_string_literal: true

require_relative "outreach/base_controller"
require_relative "../../../lib/elevateo/email_finder/repository"

module V2
  # AIDEV-NOTE: Finder shares the authenticated Outreach role gate; API handlers never perform discovery or TCP.
  class EmailFinderController < Outreach::BaseController
    def index
      read_finder { |repo, identity| { "items" => repo.jobs(identity.org_id, identity.user_id) } }
    end

    def show
      id = path_uuid(:job_id)
      read_finder { |repo, identity| repo.job(identity.org_id, identity.user_id, id) }
    end

    def export
      id = path_uuid(:job_id)
      read_finder { |repo, identity| { "csv" => repo.export(repo.job(identity.org_id, identity.user_id, id)) } }
    end

    def health
      read_finder { |repo, _identity| repo.health }
    end

    def suppressions
      read_finder { |repo, identity| { "items" => repo.suppressions(identity.org_id) } }
    end

    def create
      protected_write(required: %w[kind rows csv], max_bytes: 16_777_216, budget: 2_097_152) do |connection:, identity:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var input: Elevateo::WriteInput::object
        kind = Elevateo::EmailFinder::Input.text(input.fetch("kind"), 30)
        rows = Elevateo::EmailFinder::Input.rows(kind, input.fetch("rows"), input.fetch("csv"))
        repository = finder_repository(connection, identity: identity, write: true)
        Elevateo::WriteResponse.new(json: JSON.generate(repository.enqueue(identity.org_id, identity.user_id, kind, rows)), status: 202)
      end
    end

    def suppress
      protected_write(required: %w[kind value]) do |connection:, identity:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var input: Elevateo::WriteInput::object
        kind = Elevateo::EmailFinder::Input.text(input.fetch("kind"), 10)
        write_result(finder_repository(connection, identity: identity, write: true).suppress(identity.org_id, kind, input.fetch("value")), status: 201)
      end
    end

    def unsuppress
      id = path_uuid(:suppression_id)
      protected_write(body: false) do |connection:, identity:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        write_result(finder_repository(connection, identity: identity, write: true).unsuppress(identity.org_id, id))
      end
    end

    protected

    def finder_repository(connection, identity:, write:)
      campaign_repository(connection, identity: identity, write: write)
      Elevateo::EmailFinder::Repository.new(connection: connection)
    end

    def read_finder
      protected_read(allowed_query: [], budget: 16_777_216) do |connection:, identity:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        JSON.generate(yield(finder_repository(connection, identity: identity, write: false), identity))
      end
    end
  end
end
