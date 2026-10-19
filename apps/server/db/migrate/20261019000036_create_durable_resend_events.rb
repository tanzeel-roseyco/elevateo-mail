# frozen_string_literal: true

# AIDEV-NOTE: Durable provider intake is separate from send acceptance and never releases outbound hold.
class CreateDurableResendEvents < ActiveRecord::Migration[8.1]
  def up
    execute "SET LOCAL ROLE elevateo_owner"
    %w[schema intake delivery inbound status].each do |name|
      execute File.read(File.expand_path("../resend_events/#{name}.sql", __dir__))
    end
    execute "RESET ROLE"
  end

  def down
    execute File.read(File.expand_path("../resend_events/down.sql", __dir__))
    execute "RESET ROLE"
  end
end
