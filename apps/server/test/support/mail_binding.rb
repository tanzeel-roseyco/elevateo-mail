# frozen_string_literal: true

require_relative "../../lib/elevateo/mail_credentials/binding"

# AIDEV-NOTE: Synthetic scope for transport tests only; integration tests obtain the actual tuple from worker SQL.
module MailBindingFixture
  def mail_binding(**changes)
    Elevateo::MailCredentials::Binding.new(**{
      account_id: "11111111-1111-4111-8111-111111111111",
      organization_id: "22222222-2222-4222-8222-222222222222",
      mailbox_id: "33333333-3333-4333-8333-333333333333",
      credential_version: 1, credential_ref: "test:synthetic"
    }.merge(changes))
  end
end
