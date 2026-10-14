-- Operator-only template. Supply verified Auth UUIDs and a nonsecret audit receipt at execution time.
-- Example: psql -X -v ON_ERROR_STOP=1 -v org_id=<verified-uuid> -v user_id=<verified-uuid>
--   -v grant_role=owner -v receipt_ref=<approved-ticket-ref> -f bootstrap_template.sql
-- Execute first for the verified Allan owner, then separately for Callum admin and other approved grants.
\set ON_ERROR_STOP on
\if :{?org_id}
\else
  \echo 'org_id required' \quit 1
\endif
\if :{?user_id}
\else
  \echo 'user_id required' \quit 1
\endif
\if :{?grant_role}
\else
  \echo 'grant_role required' \quit 1
\endif
\if :{?receipt_ref}
\else
  \echo 'receipt_ref required' \quit 1
\endif
BEGIN;
SELECT app.enroll_verified_organization_grant(:'org_id'::uuid, :'user_id'::uuid,
  :'grant_role'::text, :'receipt_ref'::text);
COMMIT;
