# frozen_string_literal: true

# AIDEV-NOTE: Additive worker authority over BE03's immutable intent and bounded job ledger.
class CreateSendWorkerAuthority < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path('../be03_send/worker_authority.sql', __dir__))
  end

  def down
    execute File.read(File.expand_path('../be03_send/worker_authority_down.sql', __dir__))
  end
end
