# frozen_string_literal: true

require_relative "mail_binding"

# AIDEV-NOTE: Fixture admin alone provisions accounts; runtime authority is selected by production SQL.
module SmtpAccountFixture
  include MailBindingFixture

  def create_smtp_account(sender: "#{@box}@example.invalid")
    @smtp_account = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [@smtp_account, @org, @box, sender])
      INSERT INTO app_send_private.smtp_accounts
        (id,organization_id,mailbox_id,credential_version,credential_ref,sender,active)
        VALUES ($1,$2,$3,1,'test:synthetic',$4,true)
    SQL
  end

  def smtp_binding
    mail_binding(account_id: @smtp_account, organization_id: @org, mailbox_id: @box)
  end
end
