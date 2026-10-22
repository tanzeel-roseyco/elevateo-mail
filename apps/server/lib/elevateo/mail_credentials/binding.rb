# frozen_string_literal: true

require "json"

module Elevateo
  module MailCredentials
    class Unavailable < StandardError; end

    # AIDEV-NOTE: The full SQL-authorized identity binds secrets; a credential reference alone cannot identify a tenant.
    class Binding
      UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/
      attr_reader :account_id, :organization_id, :mailbox_id, :credential_version, :credential_ref

      def initialize(account_id:, organization_id:, mailbox_id:, credential_version:, credential_ref:)
        identifiers = [account_id, organization_id, mailbox_id]
        unless identifiers.all? { |value| value.is_a?(String) && UUID.match?(value) } &&
            credential_version.is_a?(Integer) && credential_version.between?(1, 2_147_483_647) &&
            credential_ref.is_a?(String) && /\A(?:test|secret):[A-Za-z0-9_.:-]{1,120}\z/.match?(credential_ref)
          raise Unavailable, "mail_credentials_unavailable"
        end
        @account_id = account_id.dup.freeze
        @organization_id = organization_id.dup.freeze
        @mailbox_id = mailbox_id.dup.freeze
        @credential_version = credential_version
        @credential_ref = credential_ref.dup.freeze
        freeze
      end

      def key(protocol:)
        raise Unavailable, "mail_credentials_unavailable" unless %w[imap smtp].include?(protocol)

        JSON.generate([account_id, organization_id, mailbox_id, credential_version, credential_ref, protocol])
      end
    end
  end
end
