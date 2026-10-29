# frozen_string_literal: true

# AIDEV-NOTE: Private operation bindings survive compaction; rollback is an explicit destructive migration only.
class CreateAppDraftsOperations < ActiveRecord::Migration[8.1]
  def up
    %w[tables policies scope save operations grants].each { |part| execute sql(part) }
  end

  def down
    execute sql("down")
  end

  private

  def sql(part)
    File.read(File.expand_path("../be02_drafts/#{part}.sql", __dir__))
  end
end
