# frozen_string_literal: true

# AIDEV-NOTE: Server-selected SMTP accounts bind new attempts; rollback refuses configuration or bound history.
class BindSmtpCredentialsToAttempt < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("../be03_send/smtp_account_binding.sql", __dir__))
  end

  def down
    execute File.read(File.expand_path("../be03_send/smtp_account_binding_down.sql", __dir__))
  end
end
