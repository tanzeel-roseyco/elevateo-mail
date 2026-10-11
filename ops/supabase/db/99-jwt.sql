-- Verbatim from supabase/supabase self-hosted/v0.8.2
-- commit 564eab8ad7840b13324f68b1bfac074ef8d51c21, docker/volumes/db/jwt.sql (Apache-2.0).
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
