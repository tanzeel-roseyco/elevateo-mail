# frozen_string_literal: true

# AIDEV-NOTE: D extends B read state in place so existing unread projections continue reading the same boolean.
class CreateAppCollaboration < ActiveRecord::Migration[8.1]
  def up
    %w[tables policies target_reader].each { |part| execute sql(part) }
  end

  def down
    execute sql("down")
  end

  private

  def sql(part)
    File.read(File.expand_path("../be02_collaboration/#{part}.sql", __dir__))
  end
end
