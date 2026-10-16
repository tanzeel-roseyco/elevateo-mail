# frozen_string_literal: true

# AIDEV-NOTE: Staging owns draft-specific quarantine; binding and sending remain inactive until their separate proof.
class CreateDraftAttachmentStaging < ActiveRecord::Migration[8.1]
  def up
    %w[tables authority reserve finalize read scan lifecycle grants].each do |name|
      execute File.read(File.expand_path("../draft_attachments/#{name}.sql", __dir__))
    end
  end

  def down
    execute File.read(File.expand_path("../draft_attachments/down.sql", __dir__))
  end
end
