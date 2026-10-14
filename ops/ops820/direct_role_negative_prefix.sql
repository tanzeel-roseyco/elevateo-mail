-- The caller appends post_restore.sql and requires its named privilege exception.
BEGIN;
ALTER ROLE elevateo_api REPLICATION;
