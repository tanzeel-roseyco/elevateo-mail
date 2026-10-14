-- The caller appends role_reachability.sql and requires its named exception.
BEGIN;
CREATE ROLE ops820_probe_bridge NOLOGIN;
GRANT elevateo_owner TO ops820_probe_bridge WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT ops820_probe_bridge TO elevateo_api WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
