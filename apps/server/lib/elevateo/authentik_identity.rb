# frozen_string_literal: true

require "net/http"
require "openssl"
require "uri"
require_relative "auth_input"

module Elevateo
  # AIDEV-NOTE: GoTrue sessions outlive upstream users; no positive cache may hide identity or tenant revocation.
  class AuthentikIdentity
    def initialize(config:, transport: nil)
      @config, @transport = config, transport
    end

    def check!(user, deadline:)
      identities = user["identities"]
      raise AuthError.unauthorized unless identities.is_a?(Array)
      selected = identities.select { |item| item.is_a?(Hash) && item["provider"] == "custom:authentik" }
      raise AuthError.unauthorized unless selected.length == 1
      identity = selected.fetch(0)
      raise AuthError.unauthorized unless identity.is_a?(Hash)
      data = identity["identity_data"]
      raise AuthError.unauthorized unless data.is_a?(Hash)
      subject, email = data.values_at("sub", "email")
      raise AuthError.unauthorized unless subject.is_a?(String) && AuthInput::UUID.match?(subject) &&
        email.is_a?(String) && email == user["email"] && company_email?(email) && data["email_verified"] == true
      deadline.within(2.0) do
        document = lookup(subject, deadline)
        results = document["results"]
        pagination = document["pagination"]
        raise AuthError.new unless results.is_a?(Array) && results.length == 1 && pagination.is_a?(Hash) &&
          pagination["count"] == 1
        current = results.fetch(0)
        raise AuthError.new unless current.is_a?(Hash)
        attributes, groups = current.values_at("attributes", "groups")
        raise AuthError.unauthorized unless current["uuid"] == subject && current["is_active"] == true &&
          current["email"] == email && attributes.is_a?(Hash) && attributes["email_verified_address"] == email &&
          groups.is_a?(Array) && groups.include?(@config.authentik_group)
      end
      true
    end

    private

    def company_email?(email)
      /\A[a-zA-Z0-9.!\#$%&'*+\/=?^_`{|}~-]+@elevateoco\.com\z/.match?(email) && !email.include?(" ")
    end

    def lookup(subject, deadline)
      transport = @transport
      status, type, body = transport ? transport.call(subject, deadline.timeout) : exchange(subject, deadline)
      raise AuthError.unauthorized if [401, 403, 404].include?(status)
      raise AuthError.new unless status == 200 && type.split(";").first == "application/json"
      AuthInput.object(body, maximum: 65_536)
    rescue IOError, SystemCallError, SocketError, Timeout::Error, OpenSSL::SSL::SSLError,
        Net::HTTPBadResponse, Net::ProtocolError
      raise AuthError.new
    end

    def exchange(subject, deadline)
      issuer = URI.parse(@config.authentik_issuer)
      host = issuer.host
      raise AuthError.new unless issuer.is_a?(URI::HTTPS) && host
      uri = URI::HTTPS.build(host: host, path: "/api/v3/core/users/",
        query: URI.encode_www_form("uuid" => subject, "include_groups" => "false", "include_roles" => "false"))
      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer " + @config.authentik_api_token
      request["Accept"] = "application/json"
      # AIDEV-NOTE: Disable environment proxies/redirects; the least-privilege token stays at the pinned HTTPS origin.
      http = Net::HTTP.new(host, 443, nil)
      http.max_retries = 0
      http.use_ssl = true
      http.open_timeout = http.read_timeout = http.write_timeout = deadline.timeout
      body = +""
      status, type = 0, ""
      http.start do |connection|
        connection.request(request) do |response|
          status, type = response.code.to_i, response["content-type"].to_s
          response.read_body do |chunk|
            raise AuthError.new if body.bytesize + chunk.bytesize > 65_536
            body << chunk
          end
        end
      end
      [status, type, body]
    rescue URI::InvalidURIError
      raise AuthError.new
    end
  end
end
