-- Operator-only template. Every variable comes from a separately verified mailbox/owner decision.
-- owner_id is empty for team or a verified UUID for personal; no values are supplied here.
\set ON_ERROR_STOP on
\if :{?mailbox_id}
\else
  \echo 'mailbox_id required' \quit 1
\endif
\if :{?classification}
\else
  \echo 'classification required' \quit 1
\endif
\if :{?owner_id}
\else
  \echo 'owner_id required (empty for team)' \quit 1
\endif
\if :{?manager_id}
\else
  \echo 'manager_id required' \quit 1
\endif
\if :{?compose}
\else
  \echo 'compose required' \quit 1
\endif
\if :{?approve}
\else
  \echo 'approve required' \quit 1
\endif
\if :{?manage}
\else
  \echo 'manage required' \quit 1
\endif
\if :{?receipt_ref}
\else
  \echo 'receipt_ref required' \quit 1
\endif
BEGIN;
SELECT app.provision_verified_mailbox_policy(:'mailbox_id'::uuid, :'classification'::text,
  NULLIF(:'owner_id', '')::uuid, :'manager_id'::uuid, :'compose'::boolean, :'approve'::boolean, :'manage'::boolean, :'receipt_ref'::text);
COMMIT;
