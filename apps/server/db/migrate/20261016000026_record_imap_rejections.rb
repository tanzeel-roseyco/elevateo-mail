# frozen_string_literal: true

# AIDEV-NOTE: Retain digest/reason evidence instead of silently skipping poison messages or retaining raw mail in SQL.
class RecordImapRejections < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("imap_rejections/schema.sql", __dir__))
    execute File.read(File.expand_path("imap_rejections/reject.sql", __dir__))
  end

  def down
    # AIDEV-NOTE: An operator must archive and explicitly clear evidence before this migration can discard its table.
    execute <<~SQL
      -- AIDEV-NOTE: Exclude concurrent receipts between the emptiness check and destructive DDL.
      LOCK TABLE app.inbound_imap_rejections IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM app.inbound_imap_rejections) THEN
          RAISE EXCEPTION 'preserve IMAP rejection evidence before rollback' USING ERRCODE='55000';
        END IF;
      END $$;
      DROP FUNCTION app.leased_reject_imap_mail(uuid,integer,bigint,bigint,text,text,uuid);
      DROP TRIGGER imap_receipt_excludes_rejection ON app.inbound_imap_receipts;
      DROP FUNCTION app.guard_imap_receipt_state();
      DROP TABLE app.inbound_imap_rejections;
    SQL
  end
end
