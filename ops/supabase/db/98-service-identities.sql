-- OPS-402: each infrastructure daemon has a separate database credential.
\getenv authpass AUTH_DB_PASSWORD
\getenv restpass REST_DB_PASSWORD
\getenv storagepass STORAGE_DB_PASSWORD
ALTER ROLE supabase_auth_admin PASSWORD :'authpass';
ALTER ROLE authenticator PASSWORD :'restpass';
ALTER ROLE supabase_storage_admin PASSWORD :'storagepass';
REVOKE CREATE ON DATABASE postgres FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
