# BE-01 analytical tradeoff scenarios

These are reasoned design scenarios, not executed application tests or an Obsidian connection simulation. The coordinator searched available tools/resources and reported no actual Obsidian connection. Keep that limitation visible in review records; do not claim the requested connection gate passed.

| Scenario | Chosen behavior | Alternative and consequence | Evidence needed |
| --- | --- | --- | --- |
| User A returns a pooled connection after an exception; user B next borrows it | Explicit transaction-local context; rollback clears authority, absent context denies | Connection-global claims can authorize B as A; Rails-only filtering can omit a predicate | Real restricted pool-size-one commit/rollback/exception and concurrent tests |
| A tester accidentally uses the database owner | Harness refuses to run the restricted tests; FORCE RLS plus nonowner runtime | Successful fixtures under owner can hide policy failures | Role/session/ownership assertions and denial matrix |
| A user belongs to both organizations and links a mailbox to the wrong organization | Composite keys bind row organization independent of memberships | Membership-only validation can accept the inconsistent edge | Fixture-writer FK failure, separate from RLS denial |
| A server credential reaches PostgREST | Application schema is not exposed; schema/table grants are revoked, including service_role | FORCE RLS alone does not constrain a BYPASSRLS role | Exposed-schema/grant audit and actual anonymous/user-JWT requests |
| Rails must access a private Storage object | A single adapter uses server-only Storage HTTP credential after application authorization | Direct user Storage policies create a second authority; pretending no privileged service credential is needed hides a real boundary | Real authorized/foreign/anonymous object tests; credential isolation audit |
| Storage HTTP stalls | Release DB authorization transaction before network call | Holding a small DB pool during object I/O blocks unrelated work | Adapter boundary review; BE-05 settles concurrent revocation/product semantics |
| A minimal profile omits PostgREST | Reject omission because pinned Storage configuration depends on it | Four advertised services may boot partially but fail real operations | Five-service boot and object round-trip |
| Auth sends a recovery message with incorrect SMTP settings | Startup rejects configuration and runtime network cannot reach external fixture | Mailpit label or Rails-only validation does not constrain Auth's own SMTP | Auth capture, network/control checks and relay configuration |
| An old application backup says sending is active | External runtime hold stays asserted; no BE-01 dispatch/release implementation | DB-only activation state can silently change after restore | Restore/mutation test and no dispatch entry point |
| Existing credit runs out after Checkpoint A | Stop and preserve incomplete evidence; later task continuation requires its own gate | Calling scaffolding complete or skipping RLS/tests misrepresents completion | Coordinator monitoring/stop record and explicit incomplete status |
| One large PR requires review | Cover every changed area with bounded fresh slices and a separate design reviewer | Mandatory two-PR split adds another base/gate without inherently improving line coverage | Actual reviewed ranges, defect density, fix rechecks |
| Full runtime JWT verifier expands this foundation | Defer to BE-02; no protected routes available until complete verifier/current-session checks | Partial verifier can look production-ready while revocation is absent | BE-01 real Auth smoke; BE-02 complete authentication acceptance |

The foundation favors correctness, restricted authority and reproducible tests over fewer containers or a shorter apparent checklist. Every claimed benefit remains a hypothesis until the implementation acceptance matrix passes.
