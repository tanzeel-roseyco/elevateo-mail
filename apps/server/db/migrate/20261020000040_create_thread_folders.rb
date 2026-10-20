# frozen_string_literal: true

# AIDEV-NOTE: Folder state is mailbox-shared while stars remain scoped to the authenticated actor.
class CreateThreadFolders < ActiveRecord::Migration[8.1]
  def up
    %w[tables policies].each { |part| execute sql(part) }
  end

  def down
    execute sql("down")
  end

  private

  def sql(part)
    File.read(File.expand_path("../be05_folders/#{part}.sql", __dir__))
  end
end
