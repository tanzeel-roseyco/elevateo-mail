# ADV140 ? eligible-assignee SQL review

Candidate: bd1969ae53c02b27741375c766312301abb772bd, Sabine SEC802. Independent static review only; no tests or builds executed. Zero confirmed implementation defects over 272 unique versioned source LOC: 0.00 defects/KLOC. This is not runtime acceptance.

## Coverage and limits

Read exactly assignment_member_options.sql lines 1?67 (67 LOC), migration 20261015000019_create_assignment_member_options.rb lines 1?16 (16), assignment_member_options_database_test.rb lines 1?142 (142), and assignment_member_options_migration_test.rb lines 1?47 (47). Three reads exposed 67, 142 and 63 source LOC respectively, each below 180; total 272 below the 350 cap. File-name inventory exposed no extra source. No previous version, helper implementation, original assignment writer, schema, connection fixture, controller or documentation source was inspected. All counts include comments/blank lines. No styling findings.

## Functional assessment

SQL lines 17?35 reject invalid limits/null identity components and negative generations, obtain fresh session authorization, compare returned user/session/context/organization/generation, require matching request GUCs and current organization membership. Non-ok proof statuses return without enumeration. SECURITY DEFINER uses pg_catalog-only search_path and qualified relation/function references; values are typed parameters rather than dynamic SQL. No additional table privilege is granted.

Lines 38?46 permit shared-mailbox visibility to organization members, require private-mailbox actor membership, and require an existing thread. Lines 48?60 restrict private targets to current mailbox members, enumerate only UUIDs, and use bounded UUID keyset ordering with one sentinel; the continuation is the last emitted UUID, not the sentinel. Empty result aggregation yields an array and a null continuation. This implements the agreed existing visibility-based assignment predicate within the assigned context; equivalence to the actual write routine is an unverified dependency, not independently established here.

Tests lines 73?105 meaningfully assert sorted two-page enumeration, redaction, exhausted pagination, organization-target removal, private actor denial, target exclusion and private-target revocation. Lines 107?140 exercise foreign/absent/empty mailbox denial, actor organization revocation, stale generation/context, wrong auth session, out-of-range limits and runtime-role ACLs. They include happy paths and multiple failure paths rather than merely reproducing SQL text. Migration test lines 11?29 executes transactional down/up/down/up and checks restored owner/runtime grants; lines 34?45 explicitly inspect PUBLIC execute privilege. Migration down removes the exact routine signature and creates no persistent schema/table changes.

## Residual coverage and runtime gates

Missing focused witnesses include null digest and mismatched user, mismatched GUCs independently of proof inputs, session expiry/revocation, null limits/negative generation, the maximum 50-row boundary with a 51st sentinel, and private actor-membership revocation after a previously successful page. These are uncovered branches, not proven production defects. Session authorization correctness/status contracts and generation bump behavior remain delegated dependencies. Snapshot-consistent authorization does not establish behavior under concurrent revocation across transactions.

Database teardown lines 17?27 deletes mailboxes before superclass tenant cleanup; safe dependent-thread deletion, superclass connection lifecycle and failure cleanup cannot be verified without the excluded schema/helper. Migration transaction and owner EXECUTE prerequisite must be exercised using the actual QA migrator and API roles. The migration assertion at SQL lines 3?8 deliberately fails absent prerequisites; runtime must prove deployment establishes those prerequisites without broadening runtime grants.

Required Soren fleet evidence: exact-candidate migration up/down/up with ACL inspection; database suite in a fresh disposable database and varied order; then real API-role protected session calls and existing assignment-write parity for shared/private members, foreign identities and revocation. No HTTP/UI/runtime acceptance follows from this review. Existing 27-line direct reports were not treated as grant or runtime evidence.

## Design tradeoff simulation

A narrow SECURITY DEFINER UUID directory avoids exposing full roster tables and preserves current assignment semantics. Simulated shared mailbox: an organization member can enumerate eligible organization UUIDs without compose/manage privileges; adding those privileges here would hide valid targets relative to the agreed existing writer. Simulated private mailbox: actor membership gates enumeration and target membership gates eligibility, so an organization outsider to that mailbox learns no roster. Simulated concurrent revocation: one request retains its authorized database snapshot while the next request reauthorizes; stronger immediate cancellation would require an explicit cross-request authority policy, not an unsupported change in this routine. Bounded keysets cap page work/output and avoid offset rescans, but index/query-plan performance remains unmeasured.
