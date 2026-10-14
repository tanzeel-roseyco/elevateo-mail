-- Expected helper smoke failure aborts this transaction; the grant cannot persist.
BEGIN;
GRANT USAGE ON SCHEMA app_drafts_private TO elevateo_attachment_gateway;
