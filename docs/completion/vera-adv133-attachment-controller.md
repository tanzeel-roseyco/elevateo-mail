# ADV133 — Attachment controller narrowing

Exact source: 379da931ad98032f7e04b31a4733085ca551cc44, completion-cassian-int801. Controller blob 5c6afd1789c5ff43e579713f85573e9c464a554f. Static review only: no tests, builds, Docker, live operations, or implementation edits.

Coverage: apps/server/app/controllers/v2/inbox_attachments_controller.rb 1–57 requested scope, plus necessary path_uuid tail 58–61 (61 current LOC); parent changed line 21 (1 distinct parent LOC); apps/server/sig/attachments.rbs 9–16 and 56–64 (17 LOC), thread_reads.rbs 28–32 (5), write_input.rbs 22–24 (3), read_controller.rbs 1–16 (16). Total 103 unique versioned source LOC. Zero-context diff repeats already counted successor lines. Largest read: 57 current lines plus one distinct parent line. Initial wc counted 61 lines before source inspection. Failed lookup of root-level sig/read_controller.rbs returned no source; corrected path used.

Confirmed defects: 0. Density: 0/103 = 0 defects per KLOC.

The replacement of tuple/map assignment with three sequential path_uuid calls preserves the same mailbox/thread/message order and UUID validation. The actual helper passes each fetched path value to WriteInput.uuid, whose declared return is String. This allows individual String bindings without asserting unchecked input types. Missing-path behavior remains the existing fetch failure; invalid value behavior remains the existing UUID boundary. No route or registry changes occur in the scoped diff.

The authorization annotation matches the consumed structural interface: four String identity/scope keywords, a Symbol capability, and void return. The lambda still requires capability :read, organization equality with authenticated identity.org_id, and exact mailbox/thread/message equality with the validated route bindings before calling ThreadReads.direct_message. The ThreadReads call receives the same thread/message and mailbox query; its returned String is intentionally discarded, with nil returned from authorization. Permission exceptions propagate rather than being replaced by a permissive fallback. This is preservation of the existing proof call, not independent certification of ThreadReads SQL authority.

The read wrapper declaration matches connection, identity, session and query annotations. Pagination remains default 50, rejects empty/nondecimal/zero/over-50 limits, and validates provided cursor UUIDs. NoStorage still denies byte access. Query budget, repository/list calls and exception mapping are unchanged. No added queries, loops, dependencies, mutable state or buffering paths were introduced.

Design tradeoff: explicit assignments preserve runtime validation while giving the type checker precise local facts. A structural authorization interface accurately describes the narrowly consumed callback; replacing it with a generalized authorization class would add complexity without improving this repair. Broader API substitution is unnecessary.

Full rubric applied to scoped code: functionality, null/empty/max boundaries, state coupling, simplicity/cohesion, naming/why-comments, error propagation, authorization and hot-path work. Existing test/docs source was outside this small assignment; exact-source strict typing and runtime failure/happy-path evidence remain pending. No Steep PASS or route activation acceptance claimed.

Excluded: route registry contents, actual protected_read execution beyond prior ADV131 wrapper review, ThreadReads implementation/SQL, attachment service/repository authority, cursor semantics beyond declared UUID input, and HTTP/database tests. Central activation and private proxy remain integration prerequisites; the preserved inactive-adapter comment is not proof of registry state.
