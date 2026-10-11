-- Idempotent Elevateo bootstrap: login secrets and schema shells only.
-- Grants, tables and policies belong to Rails migrations (apps/server/db/migrate).
\set ON_ERROR_STOP on
\set migrator_pw `echo "$MIGRATOR_DB_PASSWORD"`
\set api_pw `echo "$API_DB_PASSWORD"`
\set worker_pw `echo "$WORKER_DB_PASSWORD"`

SELECT format('CREATE ROLE %I NOLOGIN NOINHERIT', r)
  FROM unnest(ARRAY['elevateo_owner', 'elevateo_app_read']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec
SELECT format('CREATE ROLE %I LOGIN NOINHERIT', r)
  FROM unnest(ARRAY['elevateo_migrator', 'elevateo_api', 'elevateo_worker']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec

ALTER ROLE elevateo_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE elevateo_app_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE elevateo_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_pw';
ALTER ROLE elevateo_api LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'api_pw';
ALTER ROLE elevateo_worker LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'worker_pw';

-- Migrator acts only as the NOLOGIN owner; runtime logins never receive it.
GRANT elevateo_owner TO elevateo_migrator;
ALTER ROLE elevateo_migrator SET role = 'elevateo_owner';
GRANT elevateo_app_read TO elevateo_api;

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION elevateo_owner;
CREATE SCHEMA IF NOT EXISTS app_meta AUTHORIZATION elevateo_owner;
REVOKE ALL ON SCHEMA app, app_meta FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM elevateo_api, elevateo_worker, elevateo_migrator;
GRANT CONNECT ON DATABASE postgres TO elevateo_migrator, elevateo_api, elevateo_worker;
SELECT 'bootstrap: ok' AS status;
