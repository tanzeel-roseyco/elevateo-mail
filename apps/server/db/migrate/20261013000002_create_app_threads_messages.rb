# frozen_string_literal: true

# AIDEV-NOTE: B owns only these fixed SQL files; rollback preserves A authorization and foundation tables.
class CreateAppThreadsMessages < ActiveRecord::Migration[8.1]
  def up
    %w[validation tables policies].each { |part| execute sql(part) }
  end

  def down
    execute sql("down")
  end

  private

  def sql(part)
    File.read(File.expand_path("../be02_threads/#{part}.sql", __dir__))
  end
end
