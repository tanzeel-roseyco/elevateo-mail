# ADV806 bounded review plan

Independent functional and separate practical/theoretical design review PENDING; defects and defects/KLOC PENDING, not zero. Author assessment is source inspection only. Linters, runtime and browser checks NOT_RUN. No reviewers/paid models were silently substituted.

| Packet | Exact source scope | Unique LOC |
| --- | --- | --- |
| A | ops/tests/be02/adv806_mailpit_entry_test.rb whole lines1–130 | 130 |
| B | reused ops/tests/be02/http_support.rb whole lines1–130 | 130 |
| C | apps/server/lib/elevateo/auth_entry.rb28–77 (50); apps/server/db/be02/pending.sql16–41 (26),69–87 (19); apps/server/lib/elevateo/auth_client.rb10–12 (3),67–69 (3),82–84 (3); apps/server/lib/elevateo/session_crypto.rb15–18 (4); pinned upstream user.go171–180 (10) | 118 |

Three divided packets each <=200; full assignment378 LOC INCLUDING context. Reused R9 HTTP source/evidence references are prior coverage, not additional new reviewer coverage. Receipt authenticates exact Git blobs and paths; upstream source URL/revision is explicit, not an imported application blob. Overlapping source/design reviewers are nonadditive.

Apply full INT-401 rubric: purpose/correctness and real authority; null/empty/max/malformed requests; state interactions/tenant identity; narrow scope and practical design tradeoffs; single-purpose helpers/duplication/naming/why-comments; uncomplicated control flow; real happy and negative controls; synchronized owned docs; boundary sanitization/permissions/no credential leakage; bounded polling and query cost. This scope adds no endpoint/query hot path, production behavior or acceptance relaxation. Generated random identities prevent shared-user coupling; controlled current-password rejection exercises the actual durable password seam rather than adding an Auth fault-proxy. Remaining expiry and OS-process/browser seams are explicit limits.
