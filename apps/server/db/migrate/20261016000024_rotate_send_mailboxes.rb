# frozen_string_literal: true

# AIDEV-NOTE: Fair discovery remains advisory; this migration preserves the existing worker function OID and grants.
class RotateSendMailboxes < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("../be03_send/mailbox_rotation.sql", __dir__))
  end

  def down
    execute File.read(File.expand_path("../be03_send/mailbox_rotation_down.sql", __dir__))
  end
end
