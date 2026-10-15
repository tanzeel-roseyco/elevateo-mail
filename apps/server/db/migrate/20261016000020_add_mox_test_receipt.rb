# frozen_string_literal: true

# AIDEV-NOTE: Mox receipts are fixture evidence only; rollback cannot erase any attempted submission.
class AddMoxTestReceipt < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path('../be03_send/mox_test_receipt.sql', __dir__))
  end

  def down
    execute File.read(File.expand_path('../be03_send/mox_test_receipt_down.sql', __dir__))
  end
end
