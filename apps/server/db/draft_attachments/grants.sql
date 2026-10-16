-- AIDEV-NOTE: API functions recheck cookie guards; no API/worker can directly read the reservation ledger or mutate rows.
REVOKE ALL ON FUNCTION app_drafts_private.lock_attachment_draft(text, uuid, uuid, uuid),
  app_drafts_private.attachment_stage_result(app_drafts_private.attachment_stage_operations, text)
  FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
REVOKE ALL ON FUNCTION app.reserve_draft_attachment(text, uuid, uuid, uuid, text, uuid, uuid, text, text, integer, text),
  app.finalize_draft_attachment(text, uuid, uuid, uuid, text, uuid), app.list_draft_attachments(uuid, uuid)
  FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.reserve_draft_attachment(text, uuid, uuid, uuid, text, uuid, uuid, text, text, integer, text),
  app.finalize_draft_attachment(text, uuid, uuid, uuid, text, uuid), app.list_draft_attachments(uuid, uuid)
  TO elevateo_api;
REVOKE ALL ON FUNCTION app.due_draft_attachment_scans(integer), app.claim_draft_attachment_scan(uuid, uuid),
  app.record_draft_attachment_scan(uuid, text, uuid, integer, text)
  FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.due_draft_attachment_scans(integer), app.claim_draft_attachment_scan(uuid, uuid),
  app.record_draft_attachment_scan(uuid, text, uuid, integer, text) TO elevateo_worker;
