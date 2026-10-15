# Durable mailbox opportunities

MAIL1022: Durable mailbox rotation prevents one busy mailbox from monopolizing due-job discovery. All712 synthetic mailboxes received one opportunity before the1000-job backlog received its second; selector p95 23.04ms, maximum48.17ms, eight concurrent lookups maximum193.12ms with3s statement/1s lock limits. Fleet-02 gate be02-d1d8d767a42e44f79a8ea17f24a92e80 passed157 standard suites/927 tests/10,806 assertions; Mox10/109, HTTP1/33 and worker-entry2/107; combined940 tests/11,055 assertions with zero failures/errors/skips. Twelve dedicated suites remain deferred. Steep, RuboCop359 files, fixture lint3 files, frozen source and exact cleanup passed;17 independent absence checks passed. Shared bases/persistent data retained; free bytes254850682880 ->254832197632 (shared delta-18485248, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Held profile composition, production secrets, multi-account ingestion and app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/mailbox-rotation.md.

## Behavior and isolation

The SQL selector persists each mailbox's last offered turn and serializes updates through one cursor.
It selects the least-recently offered eligible mailbox, then its oldest due send. A newcomer starts
at the current turn; it cannot continually jump ahead of existing waiting mailboxes. Selection is
advisory: it creates neither a lease nor permission to send. Claim and final authorization remain
responsible for current tenant/session/account, consent/suppression and budget fences.

Eligibility retains current epoch, simulated state, due time, eligible action, terminal-state,
cancellation/reconciliation and lease checks. Exclusions are bounded to32 UUIDs. Private scheduler
tables have forced RLS and no runtime table privileges. The function's identity/ACL are preserved.
The down migration refuses any persisted schedule history; choose a forward fix for populated data.

## Measured fleet-02 workload

One mailbox has1000 active jobs, the other711 have one each; every mailbox has20 terminal jobs.
An original real-approved template adds one cancelled historical job:1711 active and14,241 terminal.
The bulk-generated rows test selection cost and fairness, not authorization of every synthetic row.
Foreign keys and deferred completeness remain active; actual approval/transport use separate suites.

All712 first opportunities were distinct and the older busy mailbox won the first tie. Afterwards
999 of its jobs remained.712 serial lookups measured p95 23.04ms/max48.17ms; eight concurrent lookups
completed with maximum193.12ms and advanced the cursor eight times. Worker timeouts stayed3s/1s;
only fixture seeding received a90s timeout. The complete load suite passed723 assertions in43.71s.
These are one shared-host workload measurements, not a general scalability or delivery guarantee.

## Design review

MAIL1022 design: retain PostgreSQL and one serialized discovery cursor; advance opportunities independently of claims, never hold this cursor across SMTP I/O. Oldest-first can defer a lone mailbox behind1000 jobs; the measured fixture offers all712 boxes once within712 selections despite14,241 terminal jobs. Persisted newcomer turns stop continuous arrivals jumping the queue. A direct eligible-job join is mathematically equivalent with identical predicates/order, but an unmeasured rewrite adds no demonstrated benefit: retain the tested lateral query (p95 23.04ms; eight concurrent max193.12ms). Tradeoff: a single cursor caps discovery throughput; no public SMTP throughput or700 simultaneous-user claim follows. Down migration refuses scheduler history rather than discarding fairness state. At2 workers and5/10/15 seconds per operation, a712-operation sweep is29m40s/59m20s/89m (planning arithmetic only). Next slice connects held Mox profile to bounded Drain; production credential provider, multi-account ingress and operational activation remain work. Soren read400 source LOC as a read-only design adviser, identifying preparation gaps rather than new runtime defects. Obsidian connector unavailable; filesystem vault mirror retained.

## Verification and cleanup

MAIL1022 adversarial coverage: scheduler RLS/grants, preserved function identity, bounded exclusions, eligibility/cancellation/lease behavior, new arrivals, reconnect/transaction/concurrent selectors, cross-tenant fairness, rollback refusal and realistic selector load. Full user rubric supplied; every pass <=200 physical LOC and each reviewer <=400 cumulative; formatting delegated to lint. Eli251 LOC/0 defects; Ines394/0; Mira397/0: aggregate0 new confirmed defects/1042 reviewed physical LOC =0 defects/KLOC, including context/repeated lines rather than unique repository coverage. Nora separately reviewed design360 physical/359 unique LOC and simulated backlog/arrival/worker tradeoffs. The prior MAIL1020b starvation finding is now fixed by persisted rotation and712-mailbox runtime evidence. All13 changed implementation/test files (739 physical LOC) are represented by scoped review packets and their dependencies. ON DELETE RESTRICT is a future deletion-workflow consideration, not a confirmed regression: no runtime mailbox-policy deletion path was found. Gate be02-d1d8d767a42e44f79a8ea17f24a92e80 passed; no full-project or live-delivery approval is implied.

The source manifest SHA-256 is6e373e9382eb3b7f42bbea9c70ccadfc2e92187ad38596334bf4e8598e4e11ac.
Before/after source manifests match. Machine-readable totals and exact resource cleanup are in
`docs/completion/qa815-evidence/mail1022-result.json`; raw logs remain under `ops/local/` plus gate ID.
No local Docker build occurred. Shared host free-space changes cannot be attributed to this cleanup.
No frontend source changed; this gate does not close browser, Android, macOS or Windows acceptance.
