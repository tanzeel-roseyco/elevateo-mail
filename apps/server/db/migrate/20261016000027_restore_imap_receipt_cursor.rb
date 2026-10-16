# frozen_string_literal: true

# AIDEV-NOTE: Replacing bodies preserves owners, signatures and revoked core ACLs; receipts remain immutable.
class RestoreImapReceiptCursor < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("imap_receipt_replay/up.sql", __dir__))
  end

  def down
    execute File.read(File.expand_path("imap_receipt_replay/down.sql", __dir__))
  end
end
