-- AIDEV-NOTE: Worker needs public function namespace lookup, never private schema or direct draft-table access.
GRANT USAGE ON SCHEMA app TO elevateo_worker;
REVOKE ALL ON app.drafts, app_drafts_private.operations FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
GRANT SELECT (id, organization_id, mailbox_id, actor_id, subject, recipients, body_text,
  reply_to_thread_id, version, state, created_at, updated_at) ON app.drafts TO elevateo_app_read;
REVOKE ALL ON FUNCTION app.draft_scope(uuid, uuid),
  app.save_draft(text, uuid, uuid, uuid, text, integer, text, jsonb, text, uuid),
  app.draft_operation(uuid, uuid, uuid), app.compact_draft_operations(integer)
  FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.draft_scope(uuid, uuid), app.draft_operation(uuid, uuid, uuid) TO elevateo_api;
GRANT EXECUTE ON FUNCTION app.save_draft(text, uuid, uuid, uuid, text, integer, text, jsonb, text, uuid) TO elevateo_api;
GRANT EXECUTE ON FUNCTION app.compact_draft_operations(integer) TO elevateo_worker;
