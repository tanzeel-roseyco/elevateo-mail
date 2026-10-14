-- This explicit EXECUTE remains prohibited even without schema USAGE.
BEGIN;
GRANT EXECUTE ON FUNCTION app_send_private.utc_timestamp(timestamptz)
  TO elevateo_attachment_gateway;
