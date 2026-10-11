# Opus 5.5 opinion: Elevateo Mail planning tasks

**Runtime:** Requested `claude-opus-5-5`; this session reports that identity. The coordinator records the execution metadata. **Scope:** Read-only consultation against base `103baeb`, from the supplied packet only. No tools were used, nothing was run, and every test below is proposed and **not run**.

---

## PLAN-RESEARCH

**Verdict:** Change. Inventorying the first-party UI is a **prerequisite blocker**. More breadth is optional.

**Recommendation:**
- Inventory and pin the first-party sources first: Integration `4322cfb` and Fable Frontend `d7a1f52`. They are the cheapest reuse path and the packet says they contain the Ledger React UI. Neither appears in the 25-candidate scan or the A01–A13 matrix, which is an evidence gap.
- Check whether either contains copied lightreach or shadcn primitives. If so, A08's notices apply to them.
- Then run pinned audits in this order:
  1. DOMPurify plus a sandboxed iframe/CSP, tested as one pipeline.
  2. Tiptap vs Lexical, using the same paste, IME, quote and export fixtures. Pick one.
  3. Tauri v2 plus its minimal plugins.
  4. A WebView2 .NET host template.
  5. Mailpit in a no-egress configuration.
  6. The exact ClamAV image and its notices.
- Chatwoot and FreeScout stay reference-only. FreeScout is AGPL and Chatwoot's enterprise directory is excluded from its MIT grant (scan, license section).

**Rejection criteria to add:**
- Requires a second identity system or a direct database or provider writer.
- No maintenance activity in the last 12 months.
- License covers only the core, while the needed feature is Pro.
- Adds more than one resident service for the benefit gained.

**Strongest objection:** The first-party UI may be coupled to mock data or to an old Node API. Adapting it could then cost more than a fresh build on A08 primitives.

**Simpler alternative:** A one-day spike that wires one Ledger list view to the generated OpenAPI client. If more than about 40% of the components need rewriting, keep only the design tokens.

**Acceptance checks (not run):**
- Pinned SHA for every audited item.
- File manifest listing notices for every retained file.
- Per-component result for raw-HTML and authentication-bypass grep checks.

**Residual uncertainty:** I have not seen either first-party repository.

---

## PLAN-ARCH

**Verdict:** Support Rails as the single authority, with three changes.

**1. Keep the dispatch hold out of the database.** The hold must be a deploy-time or config flag, not a database row. A restored database could otherwise carry `hold=false` from before the incident. That breaks the restore-held invariant in `contracts-and-reliability.md` and local plan §8.

**2. Verify RLS claims under pooling.** Rails pooling combined with transaction-local claims (`SET LOCAL` inside every request transaction) must be proven under the actual pooler mode. A missing transaction wrapper silently leaks claims. Add a lint or middleware that refuses any query outside a claims-set transaction.

**3. Budget the per-request session check.** The authoritative check (POLYGLOT §5, Identity) adds a database read per call. Measure its p95 cost early rather than caching it into staleness.

**Smallest vertical slice:**
- One organization, two users, one private plus one shared mailbox, using synthetic two-domain fixtures.
- Flow: signed simulated webhook → durable import → thread → draft v1/v2 conflict → approve → worker → simulated lost-response → reconcile to accepted.
- Kill the worker mid-flow and restart.

**Measurements:** p95 for the API and thread list, queue age, RSS per process, and restore duration.

**Language boundaries:**
- Rails, TypeScript, Tauri and C#: justified.
- Go doctor: acceptable.
- PHP SDK and Python fixtures: low value but low risk.
- Haskell, F#, Clojure, Lua, C and C++: keep at PX with no work scheduled.

**Strongest objection:** We lose TypeScript domain sharing, so wire-contract drift becomes the main bug class. Mitigate by generating the TypeScript, C#, Java and Swift clients from a single `openapi.yaml`, with a CI diff gate.

**Simpler alternative:** Node for everything. That gives more reuse, but it contradicts the requested Ruby role.

**Acceptance checks (not run):**
- Pooled-connection claim-leak test.
- Restore from a pre-acceptance backup while the simulator ledger is retained, with zero new provider submissions.
- Stale-generation write rejected.

---

## PLAN-AGENTS

**Verdict:** Change. There are blocking circularities.

**Contradictions and cycles:**
- **Devin route.** The plan says Devin works through the official Devin MCP. The current fact is that the native CLI is authenticated and the MCP is not configured. Pick one route and record it. A CLI session can still be the path, but its budget and duplicate controls must be specified.
- **Opinions on every fix.** Requiring three opinions on every task, including `FIX-<issue>`, makes Astra LOW repairs as expensive as design work.
- **Self-gating.** PLAN-AGENTS needs opinions to be accepted, yet opinions depend on the agent routes PLAN-AGENTS defines. Bootstrap explicitly: accept this packet's opinions as the gate for PLAN-AGENTS itself.

**Recommendation:**
- Tier the gate. Full three-opinion review for design, auth, migration and send-state changes. For bounded fixes with a reproduction, a single independent reviewer plus a regression test, escalating on any contract touch. This needs an explicit user decision because R12 says "each task".
- Add stop conditions:
  - Per-process USD cap (USD 5 is given here; also define Devin ACU caps).
  - Wall-clock timeout.
  - Maximum two repair attempts before escalation.
  - Model unavailability, notably legacy Fable 5 being retired: stop and ask, never substitute.
  - Lockfile or worktree ownership check before any write.

**Strongest objection:** Fable 5 is legacy. If it is withdrawn, every task gate stalls permanently.

**Simpler alternative:** Two opinions plus Astra MAX, which needs user consent.

**Acceptance checks (not run):**
- Ledger row for each consultation with model, session, base and cost.
- A Devin retry after a timeout finds the existing session instead of creating a new one.
- Two writers on one branch is refused.

---

## PLAN-CLIENTS (emphasis)

**Verdict:** Change. The main risk is host divergence.

**Recommendation:**
- **One shared surface.** One React bundle, plus one versioned **native bridge contract** (JSON-schema IPC commands: `auth.begin`, `secureStore.get/put`, `notify`, `agent.*`).
- **Two thin hosts implementing it.** Tauri/Rust on Mac, and C# with WebView2 on Windows (WPF or WinUI only as a frame, with no duplicated screens). A shared conformance suite runs against both.
- **Without that contract**, PKCE, callback replay protection, token storage and updater logic get written twice and drift.
- **Agent adapters** (Codex app-server over stdio; Claude Agent SDK) run in **one** host-side sidecar process per platform behind the same `startSession / streamEvents / cancelTurn` interface. They should not be reimplemented in Rust and C#.
- **Claude authentication.** Anthropic's terms bar third-party claude.ai login, so Claude in-app needs API-key authentication or approval. That is a release blocker, not a detail.

**Mobile (Java/SwiftUI):**
- Native screens are a full duplicate UI.
- Scope v1 to inbox, thread, draft and approve, with no agent features.
- Use OpenAPI-generated clients.
- Use platform secure storage (Keystore, Keychain).
- Lifecycle tests: background kill mid-draft must preserve the server draft version.

**Motion (my ownership):** Use Anime.js only for four transitions:
- Pane open, 180 ms using transform/opacity.
- Assignment chip move.
- Composer resize.
- "Draft saved" tick, which fires only after the server confirms the version.

Additional rules:
- No motion on send status beyond a state swap.
- Reduced motion is honored live through Scope media queries, with an in-app override.
- Focus never moves because of an animation.
- Animations are torn down on unmount.

**No C++, Qt or ray tracing.** None of them has an identified benefit. Reject them unless a concrete platform gap appears.

**Strongest objection:** WebView2 on Windows makes "C# GUI" mostly a shell, which may not be what the user meant.

**Simpler alternative:** Tauri on both platforms, which halves host work. This needs the user to confirm they accept C# being reduced to a shell, or to drop it.

**Acceptance checks (not run):**
- Bridge conformance suite passes on both actual operating systems.
- Playwright traces on a reference laptop: INP ≤ 200 ms, no long task over 50 ms during transitions.
- Reduced-motion toggled mid-session takes effect without reload.
- Axe scan and keyboard-only end-to-end run.
- Packaged builds: idle RAM recorded for Tauri vs WebView2.

---

## PLAN-MAIL

**Verdict:** Defer activation. There is a **hard contradiction** to resolve first.

**The contradiction:** Instantly needs real Google/Microsoft OAuth or IMAP/SMTP inboxes. Resend receiving is API/webhook-based and cannot be one of those inboxes. If the nine addresses live at Google or Microsoft so Instantly can use them, Elevateo only sees their mail through one of:
- Gmail/Graph adapters, which are deferred out of release 1.
- Forwarding, which is blocked as a live action.
- An MX change, which is forbidden without design.

The inventory must decide, per address, whether it is **Elevateo-routed (Resend subdomain)** or **external-provider inbox (Instantly-eligible)**. For now, assume these do not overlap.

**Recommendation:**
- Add a `route_owner` column and an `instantly_eligible` column to the inventory template.
- Validation rejects connecting an alias as an account.
- Wrap the Resend CLI in an allowlist runner that permits only `whoami`, `domains list` and `domains get`. It hard-fails any other verb, rather than relying on agent restraint.

**Computer-use risks:**
- OAuth consent grants send scope.
- The wizard sends a test email.
- Warmup defaults to on.
- Mitigation: screenshot-free verification of warmup=off and campaigns=0 after each account, and stop if suppression is impossible.

**Credential risk:** App passwords pasted through computer use can land in transcripts. Keep the user at the keyboard for secrets.

**Acceptance checks (not run):**
- Allowlist wrapper rejects `emails send`.
- One-domain and two-domain fixture routing.
- Alias-as-account validation fails as expected.

---

## Top three cross-task recommendations

1. **One generated contract set:** OpenAPI clients for TypeScript, C#, Java and Swift, plus a native-bridge schema with a two-host conformance suite. This is the main defense against divergence.
2. **Resolve the address-ownership contradiction** (Elevateo-routed vs Instantly inboxes) before any account or MX work.
3. **Tier the opinion gate and pick one Devin route.** Add explicit cost, time and attempt stop conditions, and record legacy-model unavailability as a stop condition.

## Hard contradictions to resolve

1. Instantly-eligible inboxes vs Resend-only receiving, with Gmail/Graph deferred.
2. Devin "official MCP" vs the authenticated native CLI fact.
3. Three opinions on every fix vs bounded, cheap Astra LOW repair.
