# frozen_string_literal: true

require "net/http"
require "json"
require_relative "auth_input"
require_relative "request_deadline"

module Elevateo
  class AuthClient
    class PasswordRejected < AuthError
      def initialize = super("request_invalid", status: 400)
    end
    MAX_RESPONSE = 65_536
    def initialize(config:, transport: nil, transaction_open: nil)
      @config, @transport = config, transport
      @transaction_open = transaction_open || -> {
        connection = defined?(ActiveRecord::Base) && ActiveRecord::Base.connection_pool.active_connection?
        connection ? connection.transaction_open? : false
      }
    end

    def login(email, password, deadline:)
      request(:post, "/token?grant_type=password", { "email" => email, "password" => password }, deadline: deadline)
    end

    def refresh(token, deadline:)
      request(:post, "/token?grant_type=refresh_token", { "refresh_token" => token }, deadline: deadline)
    end

    def user(access, deadline:) = request(:get, "/user", nil, access: access, deadline: deadline)

    def recover(email, deadline:)
      path = "/recover?redirect_to=#{URI.encode_www_form_component(@config.browser_origin + '/auth/complete')}"
      request(:post, path, { "email" => email }, deadline: deadline, accepted_rejection: true)
      true
    end

    def verify(token, kind, deadline:)
      raise AuthError.invalid unless %w[invite recovery].include?(kind)
      request(:post, "/verify", { "token_hash" => token, "type" => kind }, deadline: deadline)
    end

    def password(access, password, deadline:)
      request(:put, "/user", { "password" => password }, access: access, deadline: deadline, password_update: true)
    end

    def logout(access, scope, deadline:)
      raise AuthError.invalid unless %w[local global].include?(scope)
      request(:post, "/logout?scope=#{scope}", {}, access: access, deadline: deadline, empty: true)
      true
    end

    private

    def request(method, path, payload, deadline:, access: nil, empty: false, accepted_rejection: false, password_update: false)
      # AIDEV-NOTE: Never hold a DB transaction while waiting for Auth; no retries or redirects may rotate tokens twice.
      raise AuthError.new if @transaction_open.call
      deadline.within(2.0) do
        status, content_type, body = if @transport
          @transport.call(method, path, payload, access, deadline.timeout)
        else
          exchange(method, path, payload, access, deadline)
        end
        raise AuthError.new unless body.is_a?(String) && body.bytesize <= MAX_RESPONSE
        raise PasswordRejected if password_update && status == 422
        return {} if accepted_rejection && [400, 422].include?(status)
        raise AuthError.unauthorized if [400, 401, 403, 422].include?(status)
        raise AuthError.new unless status.between?(200, 299)
        return {} if empty || (accepted_rejection && body.empty?)
        raise AuthError.new unless content_type.to_s.split(";").first.to_s.downcase == "application/json"
        AuthInput.object(body, maximum: MAX_RESPONSE)
      end
    rescue AuthError => error
      raise if error.is_a?(PasswordRejected)
      raise(error.status == 400 ? AuthError.new : error)
    rescue IOError, SystemCallError, SocketError, Timeout::Error, Net::HTTPBadResponse, Net::ProtocolError
      raise AuthError.new
    end

    def exchange(method, path, payload, access, deadline)
      uri = URI.parse(@config.auth_url)
      http = Net::HTTP.new(uri.host, uri.port, nil)
      http.max_retries = 0
      http.open_timeout = deadline.timeout(0.5)
      http.read_timeout = http.write_timeout = deadline.timeout
      request_class = { get: Net::HTTP::Get, post: Net::HTTP::Post, put: Net::HTTP::Put }.fetch(method)
      request = request_class.new(path)
      request["Accept"] = "application/json"
      request["Content-Type"] = "application/json"
      request["Authorization"] = "Bearer #{access}" if access
      request.body = JSON.generate(payload) if payload
      status, content_type, body = 0, "", +""
      http.start do |connection|
        connection.request(request) do |response|
          status, content_type = response.code.to_i, response["content-type"].to_s
          response.read_body do |chunk|
            deadline.check!
            raise AuthError.new if body.bytesize + chunk.bytesize > MAX_RESPONSE
            body << chunk
          end
        end
      end
      [status, content_type, body]
    end
  end
end
