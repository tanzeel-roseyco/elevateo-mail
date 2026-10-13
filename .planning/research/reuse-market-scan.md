# Elevateo Mail — repository reuse and community scan

Research date/access date: **2026-10-12**. Research-only handoff for the parent agent; no implementation or production decision is made here.

## Recommendation

**2026-10-13 target reconciliation:** the user selected Rails API/worker + Laravel Blade/Livewire presentation + self-hosted Supabase + Resend in [ADR 0002](../../docs/decisions/0002-rails-laravel-presentation.md). This scan originally evaluated a TypeScript/React direction; source-language facts and dated research remain historical evidence, while current adoption guidance below follows the corrected stack. The JSON discovery ledger retains its original scan labels and is not current dependency approval. Required named opinions remain pending. Rust/Tauri Mac and C# Windows use unprivileged remote Laravel mailbox views plus separate trusted local CLI panels; Java Android/SwiftUI iOS remain later native milestones.

Prioritize **Chatwoot and FreeScout for shared-inbox workflow study**, **Tiptap versus Lexical for the composer**, **DOMPurify for content sanitization**, **Mailpit for local authentication email capture**, **ClamAV for quarantined attachments**, and **Tauri for isolated desktop hosting**. Keep the existing six references as selective component evidence. None of the inspected projects establishes an already-working replacement for Elevateo's mailbox permissions, Resend send ledger, Supabase identity/storage integration and scoped MCP connector.

Anime.js is the requested frontend dependency candidate for restrained transitions. brick/math is a real PHP arithmetic library, but the current mailbox has no arithmetic requirement that justifies adopting it. PHP already runs the Laravel presentation layer; a future exact-arithmetic feature can use a reviewed library without adding a service. Instantly warmup remains a **future plan**, with no connection, credentials or sending enabled.

## Basis and limits

Read the current README/state/product requirements, engineering standards, architecture, component-adoption matrix, goals/traceability, local build prompt and local-completion plan, plus the six reference dossiers and their pin registry. Dossier architecture/findings/adoption sections were examined as prior evidence; historical tests were not rerun. Searched AIDEV references before writing. The latest research-only instruction takes precedence over the earlier local-build workflow.

Public searches covered shared-inbox products, Java/.NET mail handling, Twake/JMAP clients, self-hosted mail operations and deliverability. Every candidate's public GitHub repository was opened. Additional license files, READMEs, architecture files and a few implementation excerpts were retrieved. Exact inspected paths and license evidence URLs are in [the companion JSON](reuse-market-candidates.json); a root directory listing is not counted as implementation inspection. Some reads returned bounded excerpts. This is a comparative scan, **not 25 security audits**.

No upstream code, setup scripts, tests, builds or containers were run; no dependencies installed, credentials changed, email sent, deployment performed, issues/PRs created or snapshots modified. Only these two research files were written. The research runner left other planning files alone. The coordinator subsequently aligned this report with the expanded stack/client proposal; this editorial reconciliation is not additional source-audit evidence.

A read-only shell request to raw.githubusercontent.com failed DNS resolution; the web tool could retrieve public sources. Several guessed raw file names returned 404/cache misses; successful alternatives are recorded below and in JSON. No exact commit SHA was independently verified. **All candidates are `pin_pending`**, including the six whose historical pins remain in the existing registry; this scan does not replace those pins or certify their manifests.

Executed search queries included `site:github.com shared inbox email Rails PHP Chatwoot FreeScout Zammad`, `site:github.com Java mail server Apache James MailKit C#`, `site:github.com LINAGORA tmail flutter Twake Mail`, `site:reddit.com/r/selfhosted shared inbox FreeScout Chatwoot email`, `site:reddit.com/r/selfhosted email mailcow deliverability`, `site:reddit.com/r/SaaS shared inbox email support frustrations`, `site:reddit.com/r/selfhosted FreeScout Chatwoot shared mailbox`, and `site:reddit.com/r/email deliverability transactional email provider`. Repository opens supplemented search discovery.

No star-count ranking, vulnerability scan, maintenance-health certification, operating-cost benchmark or legal opinion is provided. Default-branch pages may change and are not release pins. Existing dossiers concern their archived revisions; newly opened upstream pages can differ.

## Scoring rubric

Scores express **priority for our next audit**, not software quality. Merit: 0 = no justified first-release use; 1 = peripheral/deferred reference; 2 = useful bounded reference or alternative; 3 = directly addresses a current requirement. Confidence: 1 = search-only/primary access unresolved; 2 = primary documentation/license or inherited dossier; 3 = relevant implementation excerpt inspected. Confidence 3 applies only to the inspected behavior, not the whole project. Scores are deliberately separate and are not averaged.

Reuse modes are proposals: dependency = consume a pinned library; adapt = consider a small licensed port; reference = study behavior/design; service = isolated executable responsibility; reject = no current runtime use, not a judgment that the project is poor.

## Candidate comparison

The JSON supplies each candidate's exact repository, license evidence, inspected paths, blockers and next audit. Table summaries below are contextual judgments derived from those linked sources.

| Candidate / primary repository | Role and language | Proposed mode | Merit / confidence | Decision |
| --- | --- | --- | --- | --- |
| [Chatwoot](https://github.com/chatwoot/chatwoot) | Shared-inbox product; Ruby/Rails, Vue/JS | reference | 3 / 3 | Strong assignment, notes and inbox workflow reference. |
| [FreeScout](https://github.com/freescout-help-desk/freescout) | Shared-inbox product; PHP/Laravel, JS | reference | 3 / 2 | Focused mailbox UX; collision notices, internal notes and conversation merge are relevant. |
| [Zammad](https://github.com/zammad/zammad) | Helpdesk product; Ruby/Rails, JS/TS | reference | 2 / 2 | Compare ownership, ticket lifecycle and multi-channel support semantics. |
| [listmonk](https://github.com/knadh/listmonk) | Newsletter manager; Go, Vue/JS | reference | 1 / 2 | Compact binary plus PostgreSQL is a useful operating-design comparison; future consent-based lists. |
| [Mautic](https://github.com/mautic/mautic) | Marketing automation; PHP, JS | reject | 0 / 2 | Evidence of a distinct marketing-automation architecture, not the first mailbox release. |
| [Stalwart](https://github.com/stalwartlabs/stalwart) | Mail and collaboration server; Rust | reference | 1 / 2 | Protocol/identity comparison for future IMAP/JMAP needs. |
| [mailcow](https://github.com/mailcow/mailcow-dockerized) | Conventional mail stack; PHP, Shell, multiple bundled runtimes | reference | 1 / 2 | Operating-scope comparison for conventional mailbox hosting. |
| [Mailpit](https://github.com/axllent/mailpit) | Development SMTP catcher; Go, web UI | service | 3 / 2 | Local Auth invite/recovery capture; API and SMTP chaos useful for tests. |
| [Apache James](https://github.com/apache/james-project) | Mail server and processing framework; Java | reference | 1 / 2 | Real Java option for protocol processing and future mailbox interoperability. |
| [MailKit](https://github.com/jstedfast/MailKit) | Mail protocol client library; C#/.NET | reference | 2 / 2 | Future IMAP/SMTP adapter option if a .NET boundary is justified. |
| [React Email](https://github.com/resend/react-email) | Email composition/rendering components; TypeScript, React | historical candidate; reference now | 3 / 2 | Original score retained; React-specific integration is not selected for the Laravel UI. README editor claims need a compatibility audit. |
| [Tiptap](https://github.com/ueberdosis/tiptap) | Headless composer framework; TypeScript | dependency | 3 / 2 | Composer candidate; evaluate a framework-neutral integration with Blade/Livewire before selection. |
| [Lexical](https://github.com/facebook/lexical) | Editor framework; TypeScript, React bindings | reference | 2 / 2 | Alternative composer; source includes React bindings, which are not selected. Audit framework-neutral integration and serialization. |
| [DOMPurify](https://github.com/cure53/DOMPurify) | HTML sanitizer; JavaScript/TypeScript | dependency | 3 / 2 | Focused sanitizer dependency for hostile incoming and pasted HTML. |
| [ClamAV](https://github.com/Cisco-Talos/clamav) | Attachment malware scanner; C/C++, Rust components | service | 3 / 2 | Separate scanner fulfills real quarantine requirement. |
| [Tauri](https://github.com/tauri-apps/tauri) | Desktop shell; Rust, TypeScript | dependency | 3 / 2 | Remote Laravel mailbox view must be unprivileged; trusted bundled CLI panel remains separate. |
| [brick/math](https://github.com/brick/math) | Arbitrary-precision arithmetic library; PHP | reject | 0 / 3 | Immutable decimal/integer/rational arithmetic is relevant only to a future PHP costing/billing module. |
| [Anime.js](https://github.com/juliangarnier/anime) | UI motion dependency; JavaScript, TypeScript declarations | dependency | 2 / 2 | Optional subtle app-shell transitions; does not require another server runtime. |
| [Twake Mail client](https://github.com/linagora/tmail-flutter) | Multi-platform JMAP client; Dart/Flutter | reference | 2 / 2 | Concrete mobile/web client comparison and JMAP workflow reference. |
| [Quickly](https://github.com/AbdelftahZowail/Quickly) | Existing archived reference; Python/FastAPI, React/JS | adapt | 3 / 2 | Inbox/quote behavior is useful; preserve provenance. |
| [Wu-Wei-Mail](https://github.com/LuiHedlund02/Wu-Wei-Mail) | Existing archived reference; Python/FastAPI, React/TS | reference | 2 / 2 | Workspace boundary and worker separation inform domain design. |
| [cold-cli](https://github.com/andersmyrmel/cold-cli) | Existing archived reference; Go | reference | 2 / 2 | Scheduling invariants and tests are useful future audit inputs. |
| [lightreach](https://github.com/nahumoore/lightreach) | Existing archived reference; TypeScript/React | adapt | 2 / 2 | Small UI/helpers and MCP shapes can inform narrow adaptations. |
| [Instantly starter kit](https://github.com/Instantly-ai/instantly-starter-kit) | Existing archived reference; TypeScript, Python | adapt | 2 / 2 | Inspected injectable fetch factory is a useful adapter pattern. |
| [BillionMail](https://github.com/Billionmail/BillionMail) | Existing archived reference; Go, Vue/TS | reference | 1 / 2 | Domain diagnostics and operator responsibility reference. |

## Findings that affect architecture

**Shared-inbox products offer strong workflow examples, but authorization must stay explicit.** Chatwoot's inspected conversation model has inbox/account/assignee fields and assignee-oriented unread behavior. Its inspected policy admits administrators, bots, inbox members or team members through different branches. That is not equivalent to Elevateo's requirement that an administrator still needs explicit mailbox membership to read content. This is a policy mismatch, not a claim of an upstream vulnerability. Full controller scope and enterprise overrides were not audited. Its Compose example also has Rails, Sidekiq, PostgreSQL and Redis, so adopting the whole product adds an operating boundary rather than merely supplying a UI. Sources: [conversation model](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/models/conversation.rb), [policy](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/policies/conversation_policy.rb), [Compose](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/docker-compose.production.yaml).

FreeScout advertises collision notices, notes, merging and conventional mail integrations. These are useful acceptance-workflow ideas; a collision notice does not prove atomic draft approval. Zammad presents a broader helpdesk. Neither documentation read establishes a drop-in Supabase Auth/RLS or Resend transport integration. Before a full-product fork, compare the effort to replace identity, data ownership and dispatch against the current modular design. Sources: [FreeScout README](https://raw.githubusercontent.com/freescout-help-desk/freescout/dist/README.md), [Zammad README](https://raw.githubusercontent.com/zammad/zammad/develop/README.md).

**Choose one composer after a Laravel-compatible integration audit.** Tiptap supplies a headless extensible editor with paid offerings beyond its core; Lexical supplies another editor/serialization framework. Do not deploy both. React Email's currently opened canary README also advertises a Tiptap-based editor and HTML/plain-text export: that is a source observation, not approval to introduce React. Evaluate framework-neutral editor integration and Livewire DOM lifecycle before selection. Package availability, stable-release scope and editor terms were not separately verified. Email-client rendering, safe paste, CID images, quoted replies, accessibility and optimistic draft versions remain application responsibilities. Sources: [Tiptap](https://raw.githubusercontent.com/ueberdosis/tiptap/main/README.md), [Lexical](https://raw.githubusercontent.com/facebook/lexical/main/README.md), [React Email](https://raw.githubusercontent.com/resend/react-email/canary/README.md).

**Content safety is a pipeline, not an editor feature.** DOMPurify warns that changing sanitized markup afterward can defeat sanitization, and server-side use depends on the DOM implementation. The local Quickly renderer excerpt sanitizes HTML and performs quote transformations; it is a useful behavior reference, not proof that its final renderer meets Elevateo's tracking/sandbox policy. Validate final output in the actual browser/webview, with restrictive sandbox/CSP, remote resources blocked and private attachment authorization. ClamAV supplies a scanner, not proof that a file is harmless. Sources: [DOMPurify guidance](https://raw.githubusercontent.com/cure53/DOMPurify/main/README.md), [local Quickly renderer](../../third_party/upstream/quickly/frontend/src/components/EmailContent.jsx), [ClamAV](https://github.com/Cisco-Talos/clamav).

**Mailpit complements the simulator.** Its SMTP capture/API and chaos features fit local Auth enrollment/recovery tests. Its relay/forward and link-check features require deliberate disabling or network controls in a no-send profile; documented default listeners are not loopback-only. It does not establish the required independent, durable Resend acceptance/idempotency ledger, signed event replay, lost-response behavior or restore reconciliation. Those remain requirements of the later local implementation. Source: [Mailpit README](https://raw.githubusercontent.com/axllent/mailpit/develop/README.md).

**Protocol hosting is a separate product decision.** Stalwart, mailcow and Apache James address conventional mail-server responsibilities. Apache James documents different storage/queue/search packages; picking its PostgreSQL variant does not integrate Supabase Auth automatically. Twake's Flutter client expects JMAP, while Elevateo now specifies a Laravel Blade/Livewire interface over its Rails API. MailKit is a protocol client library, useful if a later .NET migration adapter earns its runtime cost. These are real options for changed requirements, not missing pieces to start alongside Resend now. Sources: [Stalwart](https://github.com/stalwartlabs/stalwart), [mailcow](https://github.com/mailcow/mailcow-dockerized), [James packaging](https://github.com/apache/james-project/blob/master/docs/modules/servers/pages/index.adoc), [Twake client](https://raw.githubusercontent.com/linagora/tmail-flutter/master/README.md), [MailKit](https://github.com/jstedfast/MailKit).

**Small utilities do not justify extra servers.** brick/math's inspected decimal class is immutable and represents precision explicitly; future PHP costing/billing could use it after numeric-input/rounding review. There is no such current requirement. Anime.js remains a UI-only option: respect reduced motion, cancel effects on unmount, preserve focus and never use animation as evidence of sending/delivery. Sources: [brick/math README](https://raw.githubusercontent.com/brick/math/master/README.md), [BigDecimal excerpt](https://raw.githubusercontent.com/brick/math/master/src/BigDecimal.php), [Anime.js manifest](https://raw.githubusercontent.com/juliangarnier/anime/master/package.json).

## Language and client disposition

| Language/runtime | Evidence in this scan | Proposed boundary |
| --- | --- | --- |
| Rails/Ruby | Chatwoot, Zammad | Workflow references; no second domain backend |
| PHP | FreeScout, Mautic, brick/math | Laravel presentation is selected; workflow study and optional exact-arithmetic dependency still need bounded review |
| Rust | Tauri, Stalwart | Narrow desktop shell; defer protocol server |
| Go | Mailpit, listmonk, cold-cli, BillionMail | Local catcher; reference tests/operations; no campaign service |
| Java | Apache James | Defer mail-server/migration boundary until protocol requirements exist |
| .NET/C# | MailKit | Possible future adapter; no standalone service now |
| Python + JS/TS frontend | Quickly, Wu-Wei-Mail | Selective workflow/domain reference; do not merge FastAPI/Celery and Node backends |
| JS/TS | Editors, React Email, DOMPurify, Anime.js and local UI references | Plain JS/Alpine browser behavior; TS contracts/MCP/tools; React sources are behavior references, not the selected UI |
| C/C++ | ClamAV | Bounded scanner service; no scanner code linked into app |
| Flutter | Twake | Cross-platform behavior reference, not an extra UI stack |

Haskell, F#, Clojure, Lua, Ionic, Electron, Qt, native Android Java and SwiftUI iOS were **not individually audited**. No current feature earned another runtime. Electron is an alternative to evaluate if measured Tauri webview incompatibility blocks requirements; Java Android and SwiftUI iOS are now requested later milestones; their detailed implementations still need audit and ADR evidence. This is an intentional scope limit, not a claim those options are inferior. Tauri architecture documentation contains mobile wording that should not be treated as a current platform support matrix; verify the selected release and actual target machines.

Postal's repository and short README were also opened during discovery, but its attempted raw LICENSE paths did not resolve; it was not advanced into the 25-candidate shortlist because additional outbound transport infrastructure repeats an already excluded role. Rspamd and Temporal were not audited: no measured spam-processing or orchestration requirement justified expanding this scan. No claim about their current licensing or fitness is made.

## License and provenance gates

MIT permits reuse subject to retaining required copyright/permission notices; it does not relicense dependencies or assets. Chatwoot explicitly excludes its enterprise directory from its MIT grant, and the opened enterprise license restricts production use. Tiptap's core license does not establish rights to every Pro/cloud component. Sources: [Chatwoot root license](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/LICENSE), [enterprise license](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/enterprise/LICENSE), [Tiptap license](https://raw.githubusercontent.com/ueberdosis/tiptap/main/LICENSE.md).

AGPL/GPL projects can be legitimate choices, but covered copying/modification/distribution obligations differ from MIT. AGPL includes corresponding-source obligations for users interacting remotely with a modified covered program. A service or folder boundary is not automatically a copyleft exemption. Review the actual combination and file notices before adoption; reference-only here means no source port is selected. Sources: [FreeScout AGPL text](https://raw.githubusercontent.com/freescout-help-desk/freescout/dist/LICENSE), [mailcow GPL text](https://raw.githubusercontent.com/mailcow/mailcow-dockerized/master/LICENSE).

ClamAV explicitly lists separately licensed bundled material, including UnRAR-related restrictions; audit the exact image/artifact. Stalwart documents per-file and enterprise licensing. Apache-2.0 and dual-license packages still need the chosen license and applicable notices preserved. These are research flags, not legal advice or a legal compatibility determination. Sources: [ClamAV licensing section](https://github.com/Cisco-Talos/clamav), [Stalwart licensing section](https://github.com/stalwartlabs/stalwart). Candidate-specific evidence URLs remain in JSON.

The six snapshots stay immutable. Their previous findings are inherited evidence, not fresh exploits or tests. Any later adaptation needs the existing component-adoption provenance record, exact reverified pin, retained notices and new tests against Elevateo's boundaries.

## Reddit discovery ledger

**Eight relevant threads: six public-thread opens, two search-snippet-only.** “Opened” means public page content was retrieved, not that every collapsed comment was read. All accessed 2026-10-12. Publication dates below come from explicit dates returned by search; opened pages often show relative ages. No authenticated/private community was accessed.

Opinions are discovery signals. They do not prove security, licensing, provider policy, platform capabilities or measured reliability. Vendor replies and self-selection can bias recommendations; conflicting successful and unsuccessful hosting reports are retained rather than voted into a technical conclusion.

### R01 — [Recommendation for Shared Mailbox Software](https://www.reddit.com/r/selfhosted/comments/ec3ogd)

- Published: 2019-12-17; access: **search_snippet_only**. Cache miss on two public open attempts.
- Query/topic: Shared inbox FreeScout Chatwoot.
- Observation: Comments distinguish focused shared mailboxes from broader ticketing products.
- Confidence: Low.
- Requirement impact: Keep ordinary company correspondence simple; compare FreeScout workflows without adopting helpdesk scope.

### R02 — [Helpdesk/tickets/sms channel suggestions](https://www.reddit.com/r/selfhosted/comments/1udq6jt/helpdeskticketssms_channel_suggestions/)

- Published: 2026-06-23; access: **opened_public_thread**. Short URL cache miss; full URL opened.
- Query/topic: Shared inbox FreeScout Chatwoot.
- Observation: One operator reports update breakage with Chatwoot and heavier-than-needed Zammad, and wants merge/API functions.
- Confidence: Medium for reported experience; low generalizability.
- Requirement impact: Require upgrade/restore drills, resource measurements and explicit integration contracts; no project reliability ranking.

### R03 — [Selfhosted webmail client for teams](https://www.reddit.com/r/selfhosted/comments/z25jv9)

- Published: 2022-11-22; access: **search_snippet_only**. Cache miss then fetch error.
- Query/topic: Shared inbox FreeScout Chatwoot.
- Observation: Four-user/five-mailbox request needs individual mailbox grants; customer ownership limits access to IMAP.
- Confidence: Low.
- Requirement impact: Separate people from addresses; resolve existing-account migration before assuming MX control.

### R04 — [At what point did your shared support inbox stop working?](https://www.reddit.com/r/SaaS/comments/1tq7yrz/at_what_point_did_your_shared_support_inbox_stop/)

- Published: 2026-05-28; access: **opened_public_thread**. Short URL cache miss; full URL opened.
- Query/topic: Shared inbox email support frustrations.
- Observation: Post and reply identify duplicate responses, unclear ownership and missed follow-ups even with few simultaneous agents.
- Confidence: Medium for pain signal; low sample size.
- Requirement impact: Show assignee/unassigned/awaiting-reply states; keep draft conflict and approval uniqueness acceptance checks.

### R05 — [I'm tired of self-hosting email, even if I do everything right, my provider's IP address range gets blocked](https://www.reddit.com/r/selfhosted/comments/1luk33a/im_tired_of_selfhosting_email_even_if_i_do/)

- Published: 2025-07-08; access: **opened_public_thread**. Public short URL redirected successfully.
- Query/topic: Email mailcow deliverability.
- Observation: OP reports range blocking and maintenance fatigue; others report successful hosting or relay use.
- Confidence: Medium for operational concern; anecdotes conflict.
- Requirement impact: Retain selected external transport, identify operator and expose bounce/rejection/unknown states; avoid guarantees about placement.

### R06 — [Self hosting email is... easy?](https://www.reddit.com/r/selfhosted/comments/1hnff8j/self_hosting_email_is_easy/)

- Published: 2024-12-27; access: **opened_public_thread**. Public short URL redirected successfully.
- Query/topic: Email mailcow deliverability.
- Observation: Positive mailcow setup report contrasts with comments about IP history and port availability.
- Confidence: Medium for contrasting discovery signal.
- Requirement impact: A successful setup is not longitudinal reliability evidence; future live validation must cover ongoing observability.

### R07 — [Advice on email deliverability](https://www.reddit.com/r/email/comments/1oi6mu4/advice_on_email_deliverability/)

- Published: 2025-10-28; access: **opened_public_thread**. Short URL failed; full URL opened.
- Query/topic: Email deliverability transactional email provider.
- Observation: User mixes manual, transactional and newsletter traffic and is unsure about domains/warmup; comments offer conflicting prescriptive advice.
- Confidence: Medium for confusion; low for technical advice.
- Requirement impact: Document message purposes and sender identities; do not treat subdomains or warmup as guaranteed reputation isolation.

### R08 — [Who offers the best transactional email api out there?](https://www.reddit.com/r/webdev/comments/1qj0m6r/who_offers_the_best_transactional_email_api_out/)

- Published: 2026-01-21; access: **opened_public_thread**. Short URL failed; full URL opened.
- Query/topic: Email deliverability transactional email provider.
- Observation: Discussion asks for reliability/cost and reports provider-specific delivery visibility gaps; vendor endorsements appear in replies.
- Confidence: Low to medium; promotional bias.
- Requirement impact: Track recipient-provider outcomes and preserve provider request IDs; do not select vendors from endorsements.

## Actionable next audits for the parent

1. **Workflow/access:** inspect Chatwoot/FreeScout assignment, collision and threading paths against two users, separate read state, restricted mailboxes, stale drafts and duplicate approvals. Inventory enterprise/module boundaries before considering a fork.
2. **Composer/content:** compare Laravel-compatible, framework-neutral Tiptap and Lexical integration candidates using the same paste/export/quote/attachment/IME fixtures. Audit final DOMPurify processing and browser sandbox together. Select one composer only.
3. **Provider and local mail:** audit Mailpit no-egress configuration; retain the independent durable simulator. Review Resend adapter contracts and unknown-send recovery without live sends.
4. **Attachment service:** pin scanner image; review bundled notices, signature freshness, resource limits and scanner-outage quarantine. Measure the full Supabase-plus-scanner footprint before choosing host size.
5. **Desktop/connector:** pin Tauri and minimal plugins; prove remote mailbox native-IPC denial, trusted local CLI-panel isolation, PKCE, session storage and current-mailbox revocation. Blade requires the remote PHP server; a static bundle is not assumed. A web test is not Windows/macOS installation evidence; a protocol harness is not actual Codex/Claude client evidence.
6. **Selective archived ports:** reverify original pins/manifests, then inspect only selected UI/helpers/adapter patterns outside snapshot trees. Do not inherit upstream send loops or authentication.
7. **Operating cost:** measure Laravel/PHP presentation and Rails idle/ten-user load, BFF latency, protected session storage, attachment scan headroom, storage growth, backup/restore duration and maintenance effort. Free source does not establish low total cost.

Stop criterion reached: remaining broad search results largely repeat shared-inbox/helpdesk, marketing automation, protocol hosting or narrow client libraries. Further breadth would be less useful than the bounded audits above. Still unverified: exact release pins, dependency advisories and license inventory, full source control flow, Supabase/Resend integrations, feature-tier costs, real resource use, email-client compatibility, native packages and live delivery. None is reported as passing.
