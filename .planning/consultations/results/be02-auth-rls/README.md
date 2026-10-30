# BE02 Auth sessions RLS consultation artifacts

<!-- AIDEV-NOTE: These are design opinions; the linked Astra decision resolves conflicting sample implementations. -->

Three fresh, independent exact-model opinions completed successfully for task `task_c52cc4cbb85c` / dispatch `ctx_8d307b627ccb`. Actual `GPT-6-Astra max` synthesis is [the decision and implementation brief](../../../../docs/completion/be02-auth-rls-decision.md). Root alone opens implementation dispatch `ctx_d9f45a4d471f`; application acceptance remains pending.

| Artifact | Purpose |
| --- | --- |
| [Fable 5](fable-5.opinion.md) | Verbatim independent recommendation with provenance header |
| [Opus 5.5](opus-5-5.opinion.md) | Verbatim independent recommendation with provenance header |
| [Fable 5.1](fable-5-1.opinion.md) | Verbatim independent recommendation with provenance header |
| [Metadata](metadata.json) | Requested/observed identities, sessions, process outcomes, usage, hashes and synthesis status |
| [Source manifest](source-manifest.json) | Frozen actual-source hashes, supplied line ranges and individual packet identities |
| [Verification](verification.json) | Artifact integrity, source-freshness disposition and retained raw-file inventory; no application tests |

All three processes used Claude CLI 2.1.296 after current preflight, safe-mode print, tools disabled and no session persistence, with no fallback or shared conversation. Raw inputs, output JSON, stderr, CLI preflight, Astra identity evidence and preparation/export helpers remain ignored as `*.log` in `ops/local/be02-auth-rls-ctx_8d307b627ccb/`. The runner reported USD 12.43845575 in aggregate; no monetary hard cap was supplied.

The decision adapts or rejects some opinion snippets. In particular, use PostgreSQL's USAGE semantics for policy applicability, CASE for PUBLIC's zero OID, no redundant advisory lock or live-row bootstrap scan, preservation of unrelated DML policies, and a NULL regression through the actual guard assertion. Do not copy an opinion's SQL without its synthesis disposition.

No application code, Docker, SSH, ultrareview, Obsidian connection, provider credentials or live sending was used by this consultation worker. The historical 74 guards are not real Auth RLS compatibility proof. All proposed application regressions are NOT RUN here.
