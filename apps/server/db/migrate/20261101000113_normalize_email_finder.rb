# frozen_string_literal: true

# AIDEV-NOTE: Validate before splitting mutable work; rollback reconstructs every input, result and pending probe.
class NormalizeEmailFinder < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("normalize_email_finder/up.sql", __dir__))
  end

  def down
    execute File.read(File.expand_path("normalize_email_finder/down.sql", __dir__))
  end
end
