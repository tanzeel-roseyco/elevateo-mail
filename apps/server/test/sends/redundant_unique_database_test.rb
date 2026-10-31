# frozen_string_literal: true

require "minitest/autorun"
require "pg"

# AIDEV-NOTE: Removing redundant uniqueness must retain the stronger business key and every FK probe index.
class RedundantUniqueDatabaseTest < Minitest::Test
  def test_unused_unique_indexes_are_removed_without_weakening_identity
    db = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    raise "wrong disposable database" unless db.db == ENV.fetch("BE02_TASK_DATABASE_NAME")

    %w[
      app_send_private.intents_organization_id_mailbox_id_draft_id_draft_version_key
      app.campaign_sequence_steps_organization_id_campaign_id_sequen_key1
      app.draft_attachments_organization_id_mailbox_id_draft_id_id_key
    ].each do |name|
      assert_nil db.exec_params("SELECT to_regclass($1)", [name]).getvalue(0, 0), name
    end
    %w[app_send_private.intents_draft_id_key app.campaign_sequence_steps_pkey app.draft_attachments_pkey].each do |name|
      assert_equal "t", db.exec_params("SELECT indisunique AND indisvalid FROM pg_index WHERE indexrelid=$1::regclass", [name]).getvalue(0, 0), name
    end
    assert_equal "t", db.exec("SELECT indisvalid FROM pg_index WHERE indexrelid='app_send_private.intent_draft_fk'::regclass").getvalue(0, 0)
  ensure
    db&.close
  end
end
