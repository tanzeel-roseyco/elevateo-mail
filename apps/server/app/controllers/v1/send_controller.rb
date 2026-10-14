# frozen_string_literal: true

require_relative "write_controller"
require_relative "../../../lib/elevateo/send_api/service"

# AIDEV-NOTE: Isolated API can load before worker intake; no installed control reader means unavailable epoch.
control_source = File.expand_path("../../../lib/elevateo/send_worker/control.rb", __dir__)
require control_source if File.file?(control_source)

module V1
  # AIDEV-NOTE: Reuse C/D guards, but render an independent send error vocabulary and keep disabled routes closed.
  class SendController < WriteController
    rescue_from Elevateo::SendError, with: :api_error
    rescue_from Elevateo::ReadResponse::Overflow, with: :send_invalid_response

    protected

    def send_service(connection, session)
      raise Elevateo::SendError.new("temporarily_unavailable") unless read_config.send_api_enabled
      Elevateo::SendAPI::Service.new(connection: connection, session: session)
    end

    def send_path(key)
      value = params[key]
      Elevateo::WriteInput.invalid! unless value.is_a?(String)
      Elevateo::WriteInput.uuid(value)
    end

    def send_read_target(key)
      query = api_query(allowed: %w[mailbox_id])
      Elevateo::WriteInput.invalid! unless query.keys == ["mailbox_id"]
      Elevateo::WriteInput.uuid(query["mailbox_id"])
      send_path(key)
    end

    def send_approval_input(input:, query:)
      Elevateo::WriteInput.invalid! unless query.empty?
      Elevateo::SendAPI::Input.new(draft_id: send_path(:draft_id), input: input)
      []
    end

    def send_epoch
      # AIDEV-NOTE: Control is outside database backups; missing worker dependency/configuration remains held.
      return nil if read_config.send_control_path.empty? || !defined?(Elevateo::SendWorker::Control)
      Elevateo::SendWorker::Control.new(path: read_config.send_control_path).read.epoch
    end

    def api_error(error)
      public_error = error.is_a?(Elevateo::SendError) ? error :
        Elevateo::SendError.new(error.code, retry_after: error.retry_after)
      response.headers["Retry-After"] = public_error.retry_after.to_s if public_error.retry_after
      api_json(public_error.body(request.request_id), status: public_error.status, limit: 4096)
    end

    def send_invalid_response(_error)
      api_error(Elevateo::SendError.new("internal_error"))
    end
  end
end
