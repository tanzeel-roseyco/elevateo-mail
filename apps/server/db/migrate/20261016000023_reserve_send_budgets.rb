# frozen_string_literal: true

# AIDEV-NOTE: Atomic recipient reservations apply only to held Mox SMTP; historical profiles retain their contract.
class ReserveSendBudgets < ActiveRecord::Migration[8.1]
  def up
    %w[budget_schema budget_requirements budget_reservation budget_authority].each do |name|
      execute File.read(File.expand_path("../be03_send/#{name}.sql", __dir__))
    end
  end

  def down
    execute File.read(File.expand_path("../be03_send/budget_down.sql", __dir__))
  end
end
