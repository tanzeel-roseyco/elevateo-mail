# frozen_string_literal: true

# AIDEV-NOTE: Role authority is additive; frozen mailbox wire DTOs and shared visibility remain unchanged.
class CreateOrganizationAccess < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path('../sec802/access.sql', __dir__))
    execute File.read(File.expand_path('../sec802/membership_patch.sql', __dir__))
  end

  def down
    # AIDEV-NOTE: Replace the SQL declaration, preserving the existing function identity, owner and runtime grants.
    sql = File.read(File.expand_path('../be02_memberships/mutation.sql', __dir__))
    execute sql.sub('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
    execute File.read(File.expand_path('../sec802/down.sql', __dir__))
  end
end
