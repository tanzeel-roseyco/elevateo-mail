# frozen_string_literal: true

# AIDEV-NOTE: Existing installations need the same replay race repair as fresh databases; grants remain unchanged.
class FixAttachmentReplayConflicts < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("attachment_replay_conflicts/up.sql", __dir__))
  end

  def down
    execute File.read(File.expand_path("attachment_replay_conflicts/down.sql", __dir__))
  end
end
