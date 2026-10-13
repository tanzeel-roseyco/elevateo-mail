-- Adapted from supabase/supabase self-hosted/v0.8.2
-- commit 564eab8ad7840b13324f68b1bfac074ef8d51c21, docker/volumes/db/roles.sql (Apache-2.0).
-- Change: pgbouncer and supabase_functions_admin omitted (Supavisor/Edge Runtime not in this profile).
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
