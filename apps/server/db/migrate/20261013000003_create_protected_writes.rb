# frozen_string_literal: true

# AIDEV-NOTE: This migration adds C/D guards without changing the allowlist or behavior of A lifecycle entrypoints.
class CreateProtectedWrites < ActiveRecord::Migration[8.1]
  PARTS = %w[guard assertions grants].freeze

  def up
    execute "SET LOCAL ROLE elevateo_session_owner"
    PARTS.each { |part| execute File.read(File.expand_path("../be02_writes/#{part}.sql", __dir__)) }
    execute "SET LOCAL ROLE elevateo_owner"
  end

  def down
    execute "SET LOCAL ROLE elevateo_session_owner"
    execute File.read(File.expand_path("../be02_writes/down.sql", __dir__))
    execute "SET LOCAL ROLE elevateo_owner"
  end
end
