# frozen_string_literal: true

# AIDEV-NOTE: Role authority is additive; frozen mailbox wire DTOs and shared visibility remain unchanged.
class CreateOrganizationAccess < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path('../sec802/access.sql', __dir__))
  end

  def down
    execute File.read(File.expand_path('../sec802/down.sql', __dir__))
  end
end
