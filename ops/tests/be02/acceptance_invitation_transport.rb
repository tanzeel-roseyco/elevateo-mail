# frozen_string_literal: true

module Be02Acceptance
  # AIDEV-NOTE: Privileged Auth and untrusted Mailpit have bounded endpoints, bytes and secret-free failures.
  class Invitation
    def object(value)
      raise Failure, "invitation_object_invalid" unless value.is_a?(Hash) && value.keys.all? { |key| key.is_a?(String) }
      value
    end

    def text(value)
      raise Failure, "invitation_string_invalid" unless value.is_a?(String)
      value
    end

    def array(value)
      raise Failure, "invitation_array_invalid" unless value.is_a?(Array)
      value
    end

    # AIDEV-NOTE: Reject late bytes/results; per-read timeout is not a hard total interruption deadline.
    def check_delivery_deadline
      deadline = @delivery_deadline
      Be02Acceptance.check(!deadline || Process.clock_gettime(Process::CLOCK_MONOTONIC) < deadline,
        "invitation_delivery_timeout")
    end

    def request(host, port, method, path, payload: nil, authorization: nil)
      request = method == "post" ? Net::HTTP::Post.new(path) : Net::HTTP::Get.new(path)
      request["Authorization"] = authorization if authorization
      request["Content-Type"] = "application/json"
      request.body = JSON.generate(payload) if payload
      body = +""
      deadline = @delivery_deadline
      remaining = deadline ? deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC) : 3.0
      Be02Acceptance.check(remaining.positive?, "invitation_delivery_timeout")
      timeout = [3.0, remaining].min
      Net::HTTP.start(host, port, nil, open_timeout: timeout, read_timeout: timeout, write_timeout: timeout, max_retries: 0) do |http|
        http.request(request) do |response|
          Be02Acceptance.check(response.code == "200" && response.content_type == "application/json",
            "invitation_http_failed")
          response.read_body do |chunk|
            check_delivery_deadline
            Be02Acceptance.check(body.bytesize + chunk.bytesize <= 262_144, "invitation_response_size_invalid")
            body << chunk
          end
        end
      end
      check_delivery_deadline
      result = object(JSON.parse(body))
      check_delivery_deadline
      result
    end

    def issue
      key = ENV.fetch("BE02_FIXTURE_SIGNING_SECRET")
      Be02Acceptance.check(key.bytesize >= 32, "invitation_signing_key_invalid")
      encode = ->(value) { Base64.urlsafe_encode64(JSON.generate(value), padding: false) }
      now = Time.now.to_i
      unsigned = [encode.call({ alg: "HS256", typ: "JWT" }), encode.call({ role: "service_role",
        aud: "authenticated", iss: "http://auth:9999", iat: now, exp: now + 120 })].join(".")
      signature = Base64.urlsafe_encode64(OpenSSL::HMAC.digest("SHA256", key, unsigned), padding: false)
      result = request("auth", 9999, "post", "/invite?redirect_to=#{URI.encode_www_form_component(REDIRECT)}",
        payload: { email: @email }, authorization: "Bearer #{unsigned}.#{signature}")
      @actor = text(result.fetch("id"))
      Be02Acceptance.check(@actor.is_a?(String) && UUID.match?(@actor) && result["email"] == @email &&
        result["email_confirmed_at"].nil?, "invitation_actor_invalid")
    end

    def self.validate_link(link)
      raise Failure, "invitation_link_invalid" unless link.is_a?(String) && link.bytesize.between?(1, 4096)
      uri = URI.parse(link)
      Be02Acceptance.check(uri.scheme == "http" && uri.host == "app.test" && uri.port == 80 &&
        uri.userinfo.nil? && uri.fragment.nil? && uri.path == "/auth/accept" &&
        link.start_with?("#{ORIGIN}/auth/accept?"), "invitation_link_invalid")
      pairs = URI.decode_www_form(uri.query.to_s)
      Be02Acceptance.check(pairs.map(&:first).sort == %w[redirect_to token type], "invitation_query_invalid")
      query = pairs.to_h
      # AIDEV-NOTE: Pinned Auth v2.196.0 hashes invitation OTPs with SHA-224: exactly 56 lowercase hex characters.
      Be02Acceptance.check(query["type"] == "invite" && query["redirect_to"] == REDIRECT &&
        /\A[0-9a-f]{56}\z/.match?(query.fetch("token")), "invitation_provenance_invalid")
      query.fetch("token")
    rescue URI::InvalidURIError, ArgumentError
      raise Failure, "invitation_link_invalid", cause: nil
    end

    def delivered_link
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 25
      @delivery_deadline = deadline
      loop do
        list = request("mailpit", 8025, "get", "/api/v1/messages?limit=50")
        messages = array(list.fetch("messages"))
        Be02Acceptance.check(messages.is_a?(Array) && messages.length <= 50, "invitation_mail_list_invalid")
        messages.each do |message|
          message = object(message)
          recipients = array(message.fetch("To"))
          next unless recipients.is_a?(Array) && recipients.length == 1 && object(recipients.fetch(0))["Address"] == @email
          id = text(message.fetch("ID"))
          Be02Acceptance.check(id.is_a?(String) && /\A[A-Za-z0-9-]{1,80}\z/.match?(id), "invitation_mail_id_invalid")
          detail = request("mailpit", 8025, "get", "/api/v1/message/#{id}")
          Be02Acceptance.check(array(detail.fetch("To")).map { |recipient| object(recipient).fetch("Address") } == [@email],
            "invitation_recipient_invalid")
          text = CGI.unescapeHTML(detail.fetch("HTML").to_s + "\n" + detail.fetch("Text").to_s)
          links = text.scan(%r{https?://[^\s<>"']+}).select { |link| URI.parse(link).path == "/auth/accept" }.uniq
          Be02Acceptance.check(links.length == 1, "invitation_mail_link_invalid")
          self.class.validate_link(links.fetch(0))
          check_delivery_deadline
          return links.fetch(0)
        end
        check_delivery_deadline
        sleep 0.5
      end
    end

  end
end
