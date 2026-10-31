> **Historical implementation and evidence snapshot.** This page records source-specific October research and test gates, not current deployment instructions or completion status. Later work supersedes its open-item lists, Resend-first decisions and fleet execution instructions. Use the [current handoff](../handoff/README.md), [mail development account](../handoff/mail-server-development.md) and [backend receipt](../completion/backend-20261030-receipt.md). Do not execute historical fleet commands; fleet-01 is off limits.

# MAIL1020a SMTP account and attempt binding

## Behavior and authority

Private `smtp_accounts` bind organization/mailbox to an immutable account UUID, monotonic version,
canonical sender, test credential reference and active flag. Forced RLS and grants deny runtime
roles direct access. Identity cannot change; reference/sender/active changes require version
advancement. Overflow and version rollback fail. No live secret is stored in this table.

The existing authorization function retains its OID/owner/ACL and lock order. For the Mox fixture
it requires an active account matching the frozen envelope sender, then copies the full identity
into the immutable attempt. Final authorization compares account/version/reference/sender again.
Unbound legacy Mox attempts fail closed; they are not retried into new identity. The Ruby adapter
validates the complete tuple and SMTP protocol before lookup or connection. IMAP entries cannot
satisfy SMTP lookup. Synthetic and Mailpit paths keep their existing contracts.

AIDEV-NOTE: The SQL final fence is the revocation boundary; later rotation cannot retract authorized SMTP bytes.
The worker is trusted and bundles are immutable/private0600 files. Only `test:` references and
fixture addresses are supported. A production secret provider and public SMTP profile remain held.

## Migration and rollback

Migration22 adds private accounts and four nullable attempt identity columns. The existing attempt
mutation trigger preserves history. Role returns to the migration owner before Rails records schema
version. Empty rollback locks both tables before checking; provision cannot race the emptiness guard.
Any account or bound attempt history refuses downgrade with55000 rather than deleting evidence.
The old function definitions/ACL identities are restored on an allowed empty rollback. Workers must
be held for application/schema downgrade. New migration dependency is included in the schema tests.

## Tests and evidence

Fleet-02 gate `be02-cab695ff6bd6445d9fd4dc6b19a3165e` passed:

- Standard148 suites/888 tests/9,621 assertions; real Mox compatibility7/27 and composition3/80.
- HTTP1/33 and worker-entry2/107; total901 tests/9,868 assertions, zero failures/errors/skips.
- Steep, RuboCop344 files and fixture lint3 files passed;12 dedicated suites deferred.
- Source manifest SHA-256: `c658b0cba4b557ad235ad5f192afefd20d57aa027d4cadc0010fc4f661b8a57f`.

Tests exercise missing/inactive/wrong-sender accounts, tuple retention, rotation/disable/re-enable,
identity mutation, version limits, direct-access denial, unbound legacy attempts, rollback with
account/history data, empty roundtrip function privileges, concurrent rollback/provision exclusion,
transport-before-network checks, protocol confusion and fixture cleanup with primary/secondary errors.
Actual Mox composition resolves its credentials from the SQL-issued tuple and imports only the owner inbox.

Earlier gates `be02-a67160ecad5446f381cadff06f61af7d` (migration role) and
`be02-d0174fcb89a54a88b0ae21b4a7e0f7aa` (two stale schema assumptions) failed and remain failed.
They exposed integration issues corrected before the final passing snapshot.

## Cleanup and remaining work

Exact cleanup removed five service containers, builder container/registration/cache, two other
volumes, network and server image.17 independent checks also found both Mox containers and three
private fixture files absent. Shared bases/persistent data remain. Free bytes254805770240 to
254871015424 are a shared-host delta of+65245184, not attributable reclamation. No compaction.

Atomic aggregate budgets, scheduling, production operational proof and remaining app/native gates
still block credentials-only readiness. No live spend, credentials, external mail, DNS or production
mutation occurred. Source/review coverage and six corrected adversarial findings are in code-reviews.md;
structured metrics and cleanup receipts are in docs/completion/qa815-evidence/mail1020a-result.json.
