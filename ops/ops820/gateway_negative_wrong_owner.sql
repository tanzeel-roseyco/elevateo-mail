-- Expected bootstrap/helper smoke failure aborts this owner swap transaction.
BEGIN;
ALTER SCHEMA app_attachment_gateway OWNER TO supabase_admin;
