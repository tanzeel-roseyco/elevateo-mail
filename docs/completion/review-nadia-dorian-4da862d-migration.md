# Nadia independent review: Dorian campaign foundation migration

Pinned source: `4da862df7c58eafbc3917ebe898216812a1c4f82` (`completion-dorian-out804`). Static review only; no Docker, SQL, migration, application test, or live send executed.

## Coverage and limits

- `apps/server/db/migrate/20261013000009_create_campaign_foundation.rb` lines 1–151: 151 unique code LOC.
- `apps/server/test/campaigns/database_test.rb` lines 1–98: 98 unique code LOC.
- Total 249 unique versioned code LOC, read in separate passes of 151 and 98, within the 180 per-call and 350 total limits. Repository, authorization function bodies, mailbox RLS, API role grants, and other tests were not read. Their behavior is unverified, especially nested mailbox visibility and role-level write access.

## Findings

### MEDIUM: read authorization guards write policies; write capability needs DB proof

Migration lines 107–110 build `role_guard` using `app.authorize_outreach_content_read`; lines 127–135 use that same guard in both `USING` and `WITH CHECK` for every table. Lines 137–139 grant `INSERT` and `UPDATE` to `elevateo_app_read`. The reviewed migration therefore does not itself express a separate draft-write authorization for mutations. This is a **conditional authorization risk**, not a proven API bypass: the effective API role grants and the two authorization function bodies were outside this review. Dorian/Cassian should show the API-role database proof that a content-read-only digest cannot perform a direct insert or update, or give writes a distinct draft-write RLS guard. Add a disposable-DB regression using a valid read-only digest, with attempted campaign and consent-event writes, asserting denial and no rows changed.

### MEDIUM: new integrity and populated rollback conditions lack database tests

Migration lines 112–123 require consent actor equality and mutation resource existence. Lines 142–149 refuse rollback when any foundation table is populated. The assigned database tests (lines 48–97) exercise missing/invalid digests and forced RLS, but neither valid-digest success/denial of the new conditions nor populated rollback preservation. Add DB cases for current versus forged actor, missing versus existing resource of each kind, a valid authorized path, and rollback on populated draft/audit tables followed by row-preservation assertions. Include an empty disposable-schema rollback case if that behavior is required. This is a **test coverage defect**, not a demonstrated migration failure.

## Other observations

Foreign keys bind leads/accounts/events to an organization and parent resource; mutation resource existence is checked by kind. The actor guard compares to transaction user context. All six tables have forced RLS and missing digest fails closed in the assigned tests. The account and mutation policies nest mailbox/account lookups; whether private mailbox visibility is enforced for the API role is **unproven**, and must be established with actual role/database evidence before making a bypass claim. Bound checks exist for names, email byte length, status, fingerprints, and versions; no unbounded loops or hot-path N+1 pattern was established in this migration. AIDEV comments state intent. Formatting belongs to linters.

**Defects/risks:** 2 actionable findings / 249 reviewed LOC = **8.03 per 1,000 LOC**. Both are MEDIUM; zero confirmed runtime failures or proven authorization bypasses. Runtime status: **NOT_RUN**. Remaining verification belongs to Dorian's source/test changes and Soren's fleet-only execution.
