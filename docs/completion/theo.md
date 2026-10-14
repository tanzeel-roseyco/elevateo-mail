# ADM-803 Theo

Scope: exact 12-person configuration roster and strict enrollment binding boundary; no authority SQL, migration, Auth enrollment, invitation, or live activation. Source: `advisors/vera-access.md` at the shared completion root, frozen checkout baseline bbf2353, `.planning/STANDARDS.md`, existing Rails V1 boundary. Configuration identities are display data and carry null email/Auth UUID. Proposed roles are provisional metadata, never effective privileges.

Dependency: Sabine's protected authority routines, current-session/organization checks, revision and generation locking, and Cassian's versioned route/DTO agreement must land before administration APIs can be connected. Lyra should use only redacted display projections. Shared mailbox visibility remains broad by frozen semantics; scoped private mailboxes are needed for future sales isolation.

Requested Docker test: from `apps/server`, `bundle exec ruby test/administration/roster_test.rb` in Soren's pinned server container under his lease. Executed: none; no host app tests. Test covers exact configuration and valid verified mapping; unknown/duplicate identities and unverified subject/forged config reject. HTTP/database authority, CSRF, redaction, concurrency and UI tests remain pending. Candidate SHA: pending commit.

Design simulations for root: Callum attempting Allan demotion must reject inside Sabine's role lock; a separate app-only guard races. Allan accessing Ben's personal content must still get generic 404 without explicit mailbox membership; redacted health is the support surface. A shared sales mailbox admits every organization member under frozen policy, so future isolated sales inbox must be private and explicitly staffed. These are analytical simulations, not runtime evidence.
