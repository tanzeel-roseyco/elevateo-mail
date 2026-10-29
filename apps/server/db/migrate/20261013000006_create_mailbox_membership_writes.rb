# frozen_string_literal: true

# AIDEV-NOTE: Membership SQL runs as the NOLOGIN app owner; runtime receives only checked function entrypoints.
class CreateMailboxMembershipWrites < ActiveRecord::Migration[8.1]
  def up
    %w[tables revision reads mutation grants].each do |part|
      execute File.read(File.expand_path("../be02_memberships/#{part}.sql", __dir__))
    end
  end

  def down
    execute File.read(File.expand_path("../be02_memberships/down.sql", __dir__))
  end
end
