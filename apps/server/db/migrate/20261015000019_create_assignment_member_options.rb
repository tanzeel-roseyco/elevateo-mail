# frozen_string_literal: true

# AIDEV-NOTE: Assignment options use the existing target predicate; only a checked API read can enumerate UUIDs.
class CreateAssignmentMemberOptions < ActiveRecord::Migration[8.1]
  SIGNATURE = "text,uuid,uuid,uuid,bigint,uuid,uuid,uuid,integer"

  def up
    execute "SET LOCAL ROLE elevateo_owner"
    execute File.read(File.expand_path("../directory/assignment_member_options.sql", __dir__))
  end

  def down
    execute "SET LOCAL ROLE elevateo_owner"
    execute "DROP FUNCTION app.assignment_member_options(#{SIGNATURE})"
  end
end
