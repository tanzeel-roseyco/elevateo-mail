# frozen_string_literal: true

require_relative "sessions"

module Elevateo
  class AuthRevocations
    def initialize(store: SessionStore.new, config: Config.current, client: nil, crypto: nil)
      @store = store
      @client, @crypto = client || AuthClient.new(config: config), crypto || SessionCrypto.new(config: config)
    end

    # AIDEV-NOTE: Worker-only EXECUTE grants own retries; a remote 401 never proves that revocation completed.
    def run_once(deadline: RequestDeadline.new)
      claim = SecureRandom.uuid
      result = SessionStore.check!(@store.call("claim_revocations", [claim, 1], deadline: deadline))
      intents = result["intents"]
      raise AuthError.new unless intents.is_a?(Array) && intents.length <= 1
      intents.each do |intent|
        raise AuthError.new unless intent.is_a?(Hash) && intent["id"].is_a?(Integer) && intent["id"].positive? &&
          intent["claim_id"] == claim && %w[local global].include?(intent["scope"])
        succeeded = false
        begin
          access = @crypto.decrypt(intent["access_token_ciphertext"], purpose: "access")
          scope = intent["scope"]
          raise AuthError.new unless scope.is_a?(String)
          succeeded = @client.logout(access, scope, deadline: deadline)
        rescue AuthError
          # Failure is recorded durably with bounded DB backoff; no credential or response body is logged.
          succeeded = false
        end
        SessionStore.check!(@store.call("finish_revocation", [intent["id"], claim, succeeded], deadline: deadline))
      end
      intents.length
    end
  end
end
