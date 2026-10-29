# frozen_string_literal: true

require_relative "sessions"

module Elevateo
  class SessionOrganizations
    def initialize(store:, crypto:, clock: -> { Time.now.to_i }) = (@store, @crypto, @clock = store, crypto, clock)

    def page(identity:, session:, query:, connection:, deadline:)
      limit = query.fetch("limit", "50")
      raise AuthError.invalid unless /\A(?:[1-9]|[1-4][0-9]|50)\z/.match?(limit)
      after = query.key?("cursor") ? decode(query.fetch("cursor"), identity, session, limit.to_i) : nil
      result = SessionStore.check!(@store.call("list_organizations", [identity.digest, identity.user_id,
        identity.auth_session_id, after, limit.to_i], connection: connection, deadline: deadline))
      items = result["organizations"]
      raise AuthError.new unless items.is_a?(Array) && items.length <= limit.to_i && items.all? { |item|
        item.is_a?(Hash) && item.keys.sort == %w[id name] && item["id"].is_a?(String) &&
          AuthInput::UUID.match?(item["id"]) && item["name"].is_a?(String) && item["name"].length <= 256
      }
      next_after = result["next_after"]
      cursor = nil
      if next_after
        raise AuthError.new unless next_after.is_a?(String) && AuthInput::UUID.match?(next_after)
        cursor = encode(next_after, identity, session, limit.to_i)
      end
      { "context_id" => session.fetch("context_id"), "authorization_version" => session.fetch("authorization_version"),
        "next_cursor" => cursor, "items" => items }
    end

    private

    # AIDEV-NOTE: Cursors bind the user's exact query/context; SQL revalidates memberships in the snapshot.
    def encode(after, identity, session, limit)
      payload = Base64.urlsafe_encode64(JSON.generate({ "user" => identity.user_id, "context" => session.fetch("context_id"),
        "version" => session.fetch("authorization_version"), "limit" => limit, "after" => after, "expires" => @clock.call + 300 }),
        padding: false)
      "#{payload}.#{@crypto.sign(payload, purpose: 'organization-cursor')}"
    end

    def decode(cursor, identity, session, limit)
      AuthInput.text(cursor, maximum: 2048)
      payload, signature, extra = cursor.split(".", 3)
      raise AuthError.invalid unless payload && signature && extra.nil? &&
        @crypto.equal?(@crypto.sign(payload, purpose: "organization-cursor"), signature)
      value = AuthInput.object(Base64.urlsafe_decode64(payload), maximum: 1536)
      raise AuthError.invalid unless value.keys.sort == %w[after context expires limit user version] &&
        value["user"] == identity.user_id && value["limit"] == limit && value["expires"].is_a?(Integer) &&
        value["expires"].between?(@clock.call + 1, @clock.call + 300)
      unless value["context"] == session["context_id"] && value["version"] == session["authorization_version"]
        raise AuthError.new("context_changed", status: 409)
      end
      AuthInput.uuid(value["after"])
    rescue ArgumentError
      raise AuthError.new("cursor_invalid", status: 400)
    rescue AuthError => error
      raise(error.status == 400 ? AuthError.new("cursor_invalid", status: 400) : error)
    end
  end
end
