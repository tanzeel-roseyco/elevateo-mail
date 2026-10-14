# OFF-406 R8 read revocation prerequisite receipt

Status: BLOCKED source authoring; runtime NOT_RUN. SCN-READ-001-F2 remains honestly unavailable. No application/test source was changed and no acceptance coverage is claimed.

## Preserved baseline

Original branch research/nadia-deliverability and HEAD c131fc12d8ed71514043367c3d2bba96a01521d0 were retained through a fast-forward to 2c31b41eed1346a2945a82f209a2e8d10e8aeabe. The untracked .planning/wave-20261014/remote-assignment.md remains untouched. Canonical bundle SHA256 matched 068e2dab6d9a30c4254e3c2db28d8bbc760bc093e8bb5c0e8f7ea2dff60ea8e1 before import. Initial bundle verification identified missing f37d09c83d6c6e46d88a5ce25cc4dd8806b888a3 and c2f887c1ddd91d8017edca428dc65002fb4f849b. Read-only fetches from the existing Elara repository preserved these under refs/preserved/nadia-r8/f37 and /c2; subsequent git bundle verify passed before fetching the supplied bundle to refs/preserved/nadia-r8/baseline. No original checkout was edited.

## Exact missing input

The mandated frozen docs/verification/scenario-matrix.json is absent from the supplied commit, this checkout and the available wave, historical test and research directories. git ls-tree and filesystem find returned no matching path. Its required SHA256 is 92daafdec8660e3b779f9a209622516cda5d29fa30680b13a3bab9aff47edaf4. Existing acceptance-controls-design.md cites lines1536-1540 permitting revocation, but a citation is not the complete hashed contract. Supply the immutable JSON/path to close this prerequisite; do not reconstruct or modify the matrix from prose. No claim of missing manager authority is made.

## Actual authority and integration findings

The real seed creates primary/other private mailboxes and organization memberships. manager_primary and manager_backup receive explicit compose/approve_send/manage_members flags; reader has explicit read with all three flags false. These are source observations, not observed live API authority. app.mailbox_membership_version checks explicit manage_members plus current organization membership; app.change_mailbox_membership rechecks authority and target organization, enforces the mailbox-wide revision and protects the last manager. Routes support GET roster, DELETE with expected_membership_version query and PUT with expected_membership_version/capabilities. Writes require real cookie, exact Origin, current session context/authorization version and session CSRF. No organization-manager field needs inventing.

A future case must require fixture_identity.case_id exactly SCN-READ-001-F2 and a fresh case/engine/attempt dataset; shared-diagnostic is insufficient isolation. Separate browser contexts can sign in manager_primary and reader. Capture the genuine reader grant and roster revision, acknowledge the real DELETE, then stimulate a victim request retaining its pre-revocation context without reloading/bootstrap first. Assert the documented context_changed error, at most one automatic recovery, fresh authority excluding the private mailbox, and removal of cached conversation/list/body data. Never replace business responses, rewind authorization generations or use sleeps to establish ordering. Bound response observation and roster scans; reject unexpected authority or malformed receipts.

Restoration must run in finally using the same real manager, fresh session/revision and captured reader capabilities, only within the dedicated case dataset. Check absence/current revision before PUT and fail on conflicting changes rather than overwrite another case. Generation changes are intentional and cannot restore the old seed authorization token. A failed/ambiguous DELETE requires a fresh roster reconciliation before deciding whether restoration is needed. The exact matrix still needs inspection before final assertions can be authored.

## Review and runtime scope

Full rubric considered for the proposed path: purpose, functional correctness, security/authorization, null/empty/limits, state effects, simple focused functions, duplication/names/why comments, meaningful positive and negative assertions, documentation and bounded API work. No changed substantive source packets exist: 0 LOC; defects/KLOC is N/A, not zero. Independent adversarial and dedicated design review remain NOT_RUN. No host tests/build/install/Docker, no seed/schema/proxy/observer/backend edits, no paid work/new workers, no persistent storage or vault changes. Soren alone schedules runtime. Cassian owns shared-document reconciliation.

Requested gpt-6.1-sol low/YOLO/Fast; actual session identifies GPT-6, effective Fast unproven. No runtime acceptance or release claim.
