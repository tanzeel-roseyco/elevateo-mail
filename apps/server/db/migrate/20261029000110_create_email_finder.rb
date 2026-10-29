# frozen_string_literal: true

# AIDEV-NOTE: Finder tables are isolated; rollback does not modify existing mail or authentication state.
class CreateEmailFinder < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("../email_finder/up.sql", __dir__))
  end

  def down
    execute File.read(File.expand_path("../email_finder/down.sql", __dir__))
  end
end
