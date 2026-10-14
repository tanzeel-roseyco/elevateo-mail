# frozen_string_literal: true

require_relative "auth_test_helper"

class AuthRevocationsTest < Minitest::Test
  include AuthFixtures

  class RevocationStore
    attr_reader :acknowledgements
    def initialize(ciphertext)
      @ciphertext, @acknowledgements = ciphertext, []
    end
    def call(name, arguments, deadline:, connection: nil)
      deadline.check!
      raise "worker call cannot borrow a tenant connection" unless connection.nil?
      if name == "claim_revocations"
        { "status" => "ok", "intents" => [{ "id" => 1, "claim_id" => arguments[0], "scope" => "local",
          "access_token_ciphertext" => @ciphertext, "attempts" => 1 }] }
      else
        raise "wrong worker function" unless name == "finish_revocation"
        @acknowledgements << arguments
        { "status" => "ok" }
      end
    end
  end

  def test_worker_only_marks_intent_complete_after_remote_success
    crypto, client = Elevateo::SessionCrypto.new(config: config), Client.new(jwt, USER)
    store = RevocationStore.new(crypto.encrypt(jwt, purpose: "access"))
    worker = Elevateo::AuthRevocations.new(store: store, config: config, client: client, crypto: crypto)
    assert_equal 1, worker.run_once(deadline: deadline)
    assert_equal [:logout], client.calls
    assert_equal true, store.acknowledgements.first.last
  end

  def test_worker_records_rejected_remote_logout_as_pending_failure
    crypto = Elevateo::SessionCrypto.new(config: config)
    client = Elevateo::AuthClient.new(config: config, transaction_open: -> { false },
      transport: ->(*) { [401, "application/json", "{}"] })
    store = RevocationStore.new(crypto.encrypt(jwt, purpose: "access"))
    worker = Elevateo::AuthRevocations.new(store: store, config: config, client: client, crypto: crypto)
    assert_equal 1, worker.run_once(deadline: deadline)
    assert_equal false, store.acknowledgements.first.last
  end
end
