-- Transaction abort on expected smoke failure rolls this membership back.
BEGIN;
GRANT elevateo_api TO elevateo_attachment_gateway
  WITH ADMIN FALSE, INHERIT FALSE, SET FALSE;
