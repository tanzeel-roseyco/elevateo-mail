# frozen_string_literal: true

class BoundMaterializedAttachments < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      SET LOCAL ROLE elevateo_owner;
      LOCK TABLE app.inbox_attachments IN SHARE ROW EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT message_id FROM app.inbox_attachments GROUP BY message_id HAVING count(*)>1000) THEN
          RAISE EXCEPTION 'message exceeds 1000 materialized attachments';
        END IF;
      END $$;
      COMMENT ON COLUMN app.messages.attachment_count IS
        'Provider-reported attachment snapshot; read projections also count locally materialized inbox_attachments.';
      CREATE FUNCTION app.bound_message_attachments() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE previous_org text:=current_setting('app.org_id',true);
      BEGIN
        -- AIDEV-NOTE: Restore caller scope; FORCE RLS otherwise silently hides the serialization parent.
        PERFORM set_config('app.org_id',NEW.organization_id::text,true);
        -- AIDEV-NOTE: A tuple write also rejects stale repeatable-read snapshots, unlike a row lock alone.
        UPDATE app.messages SET attachment_count=attachment_count
          WHERE organization_id=NEW.organization_id AND mailbox_id=NEW.mailbox_id
          AND thread_id=NEW.thread_id AND id=NEW.message_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'attachment parent message not found' USING ERRCODE='23503';
        END IF;
        IF (SELECT count(*) FROM app.inbox_attachments WHERE organization_id=NEW.organization_id
          AND mailbox_id=NEW.mailbox_id AND thread_id=NEW.thread_id AND message_id=NEW.message_id)>1000 THEN
          RAISE EXCEPTION 'message exceeds 1000 materialized attachments' USING ERRCODE='23514';
        END IF;
        PERFORM set_config('app.org_id',coalesce(previous_org,''),true);
        RETURN NEW;
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('app.org_id',coalesce(previous_org,''),true);
        RAISE;
      END $$;
      REVOKE ALL ON FUNCTION app.bound_message_attachments() FROM PUBLIC;
      -- AIDEV-NOTE: AFTER ignores ON CONFLICT DO NOTHING replays; count includes the successfully inserted row.
      CREATE TRIGGER bound_message_attachments AFTER INSERT OR UPDATE OF
        organization_id,mailbox_id,thread_id,message_id,id ON app.inbox_attachments
        FOR EACH ROW EXECUTE FUNCTION app.bound_message_attachments();
      RESET ROLE;
    SQL
  end

  def down
    execute <<~SQL
      SET LOCAL ROLE elevateo_owner;
      DROP TRIGGER bound_message_attachments ON app.inbox_attachments;
      DROP FUNCTION app.bound_message_attachments();
      COMMENT ON COLUMN app.messages.attachment_count IS NULL;
      RESET ROLE;
    SQL
  end
end
