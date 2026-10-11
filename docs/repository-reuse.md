# Selective reuse from the six audited repositories

Status: all six pinned source snapshots are now copied into `third_party/upstream` as reference material; no component has been ported into an Elevateo runtime. See [the complete source collection](../third_party/README.md), [six dossiers](reference-repositories/README.md) and [adoption matrix](component-adoption.md). The repositories were cloned and audited earlier in this conversation; this document carries that evidence forward rather than re-auditing a different revision. The exact source revisions are in [repository-pins.json](research/repository-pins.json); independent component scores and findings are in [audit-scorecards.json](research/audit-scorecards.json).

## Read the scores in context

Scores are weighted engineering judgments for the earlier Instantly/Smartlead-style outreach brief, not security certifications or a new benchmark of company-mailbox suitability. Weights: architecture 15%, maintainability 15%, security/permissions 20%, sending/data reliability 20%, product fit 10%, tests 10%, operations 10%. Dimension scores are 0–10 and weighted totals are 0–100. Reuse value is a separate judgment, not readiness to deploy.

| Repository | Audit score /100 | Reuse /10 | Relevance to this company mailbox |
| --- | ---: | ---: | --- |
| [Quickly](https://github.com/AbdelftahZowail/Quickly/tree/edca964b8bfd56e621b491aba6302b0981545898) | 53 | 8 | Inbox/composer behavior and provider-adapter boundaries |
| [Wu-Wei-Mail](https://github.com/LuiHedlund02/Wu-Wei-Mail/tree/6002b8850d685c9ad275eb1cc10a4ce0c8299145) | 56 | 7 | Workspace membership, worker separation and migrations |
| [cold-cli](https://github.com/andersmyrmel/cold-cli/tree/041c834156e873a897f19fcf9b5e040896e39d1d) | 59 | 8 | Deterministic scheduling invariants and real database test discipline |
| [lightreach](https://github.com/nahumoore/lightreach/tree/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87) | 39 | 5 | Small UI/MCP concepts and narrowly scoped mail utilities |
| [instantly-starter-kit](https://github.com/Instantly-ai/instantly-starter-kit/tree/7649e6e4f820ad18cc563d5075f34b1a8daceb36) | 43 | 8 | Typed adapter/SDK ergonomics; optional future integration only |
| [BillionMail](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744) | 49 | 4 | Operational mail-server concepts; no core code reuse |

## What “combine the best” means here

The new product does not need six running backends, six authentication models or their combined dependency trees. Keep one canonical company/mailbox schema and one sending authority. Adapt proven workflows and small utilities into it, with regression tests derived from the failures found in the audit. This greenfield TypeScript proposal supersedes the earlier campaign-heavy recommendation to retain Quickly's Python backend.

| Source | Adapt or learn from | Explicitly replace or avoid | Destination / proof |
| --- | --- | --- | --- |
| Quickly (MIT) | Unified-inbox/composer interaction, quote display, provider abstraction ideas | In-process scheduler ownership, DB-stored encryption key beside secrets, unrestricted webhooks, large mixed-responsibility modules | React mailbox modules; Resend adapter; race/timeout/HTML tests |
| Wu-Wei-Mail (MIT) | Workspace boundary, dedicated worker, versioned migrations, broad testing patterns | Marking reserved sends successful, missing final suppression checks, refresh-token revocation rolled back on errors, unrestricted URL enrichment | Supabase identity/RLS; transactional jobs; crash-before-call and revoke tests |
| cold-cli (MIT) | Stable logical work, account budget invariants, actual SQLite integration-test discipline | Send-before-durable-result gap, global per-send sleep bottleneck, relying on a CLI-only outer lock | Real PostgreSQL concurrency tests; per-provider rate budget; durable send ledger |
| lightreach (MIT) | Lightweight mailbox interface, typed component boundaries, local MCP ergonomics | No-auth baseline, unsafe incoming HTML sink, resetting all sending jobs to queued | Authenticated UI/MCP contracts, isolated content renderer and reconciliation |
| Instantly starter kit (MIT) | Clear typed adapter surfaces and generated-contract practices | Treating its external backend as our backend, unauthenticated server actions, broad POST retries, placeholder webhook acknowledgments | Typed internal API/adapter contracts; optional future Instantly integration only |
| BillionMail (AGPL-3.0) | Domain/DNS health concepts, operational checklist | Importing its server stack/AGPL code into the proposed core, broad host privileges, TLS verification bypass, JWT token-type gaps | Documentation concepts and independent implementation only |

### Component-level priorities

1. **Inbox and composer first:** demonstrate assignment, private/shared mailbox access, safe message display and competing draft edits. A polished UI does not prove reliable sending.
2. **New sending core:** implement the ledger/lease/outbox design in [contracts](contracts-and-reliability.md); none of the audited sending loops is adopted unchanged.
3. **New Supabase data model:** translate workspace ideas into organization plus mailbox boundaries. Never paste an upstream schema or assume its JWT role handling matches Supabase Auth.
4. **Provider adapter:** start with Resend. Gmail/Graph/IMAP behavior in upstream projects is useful reference only if existing-mailbox synchronization becomes an approved requirement.
5. **Connector:** share the same API permission model. An upstream MCP token or tool catalog is not an authorization solution for a team.
6. **Tests:** turn discovered failures into executable acceptance cases, especially duplicate sends, false success after a crash, revoked access, unsafe HTML and late provider events.

## License and provenance rule

The audit identified MIT licenses for the first five projects and AGPL-3.0 for BillionMail. Before porting an actual file, recheck that pinned file's license and any embedded third-party notices. Preserve the applicable copyright/license text for copied or adapted code. The source collection already has [third-party notices](../THIRD_PARTY_NOTICES.md) and per-file provenance. For each later port, extend the ledger with source repository/revision/path, destination, adaptation and regression test. Do not claim copied code is original merely because it was translated to TypeScript.

BillionMail AGPL source is now included in the explicitly requested reference collection with its license intact; no AGPL implementation is integrated into an Elevateo runtime. If the team later wants BillionMail code, make a deliberate licensing decision with qualified advice before integration; separation into a service is not, by itself, a legal conclusion. This plan uses independently written architecture ideas only.

## Validation carried forward

The earlier audit exercised available frontend/backend checks, inspected source and ran targeted recovery probes. It did not certify any project production-ready. Highlights: cold-cli's three tested Go packages passed; Wu-Wei-Mail had 1,247 backend tests pass with one unconfigured AI-provider test failing; Quickly had remaining contract failures after socket-dependent tests were rerun; lightreach had typechecks but no test suite; the starter kit's SDK built/typechecked but its dashboard remained an unauthenticated integration scaffold. These observations apply to the pinned revisions and test environments, not future upstream branches.

The scorecards retain individual evidence links and findings. The new application needs its own tests; upstream counts do not transfer across a port, language change, provider change or authentication rewrite.
