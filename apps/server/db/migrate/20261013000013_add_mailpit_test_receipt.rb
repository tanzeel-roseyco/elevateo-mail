# frozen_string_literal: true

# AIDEV-NOTE: Internal Mailpit test evidence is additive and cannot authorize remote SMTP.
class AddMailpitTestReceipt < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path('../be03_send/mailpit_test_receipt.sql', __dir__))
  end

  def down
    execute File.read(File.expand_path('../be03_send/mailpit_test_receipt_down.sql', __dir__))
  end
end
