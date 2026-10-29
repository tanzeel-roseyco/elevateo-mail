# Design-tradeoff review — Elevateo Mail frontend-completion change (`c1ac27bd..5218a274`)

## Summary

| # | Decision | Verdict | Severity | One-line reason |
|---|----------|---------|----------|-----------------|
| 1 | Windows: .NET 8 + Avalonia, Linux-Docker NSIS + osslsigncode | KEEP | LOW | Only stack that satisfies the binding Docker-only build rule; pixel QA correctly kept as a separate gate |
| 2 | Two coexisting desktop sign-in paths; bearer clients vs cookie-only contracts/v1 | CHANGE-LATER | HIGH | Three full PKCE stacks ship against a token-exchange endpoint that does not exist; the WebView-SSO path is the only working one and the dual path doubles the auth attack/maintenance surface |
| 3 | Mac update rollback: archive + launch marker + `host_ready` | CHANGE | MEDIUM | Sound design, but the declared 60-second ready window is never enforced, and rollback cannot fire if the new binary never launches |
| 4 | Typed client ports with honest "unavailable" states vs waiting for backend | KEEP | LOW | Correct for this project's acceptance culture; unavailable states are genuinely honest, contracts are anchored as requests |
| 5 | Client polling with bounded backoff vs server push | KEEP (one fix) | MEDIUM | Right call at 10 users, but one failed poll permanently stops automatic polling |
| 6 | Connections screen + AssistantPanel/agents-bridge boundary | KEEP | LOW | One-time secret, per-mailbox disclosure, and typed capability detection all match the design doc and STANDARDS §6/§7 |
| 7 | iOS: Linux-testable ElevateoCore + committed hand-written pbxproj | KEEP | LOW | Core testability is the valuable half; committed pbxproj + project.yml is a drift pair but acceptable with the sync anchor |
| 8 | Android stays Tauri WebView over web origin, KVM emulator acceptance | KEEP | LOW | Consistent with the root-selected online-only web-session design; KVM requirement is a documented fail-fast, not a hidden one |
| 9 | Three hand-written API clients + PKCE implementations | KEEP (bounded) | MEDIUM | STANDARDS §1 explicitly chooses versioned wire contracts over shared code, but the PKCE/validation quadruplication is real drift risk once a contract changes |

---

## 1. Windows client: Avalonia on .NET 8, Linux-built NSIS installer

**Alternatives:** WPF/WinUI (Windows-only build hosts), WebView2 wrapper reusing the web UI (parity with Mac), Avalonia (chosen).

**Simulation.**
- *Project rule "all builds/tests in Docker, no host builds":* WPF/WinUI cannot restore or compile on Linux; they would force either a Windows build runner (not authorized infrastructure) or a standing rule violation. Avalonia + NSIS + osslsigncode is the only chain where compile, unit test, package and Authenticode signing all run in the one approved container. The README's ADR states this correctly and keeps real-Windows visual QA as a separate release gate instead of claiming it.
- *WebView2 wrapper (the Mac approach):* would reuse the web UI and halve the duplicated surface, but WebView2 requires a Windows machine to even smoke-test, so the container would prove nothing beyond file copying — strictly less verifiable than Avalonia, whose compiled UI at least typechecks and unit-tests in Docker. It would also reintroduce a WebView into a client whose README claims "no WebView dependency" as a plain-text-mail security property.
- *Partial credentials at release:* the signing script's all-or-nothing env contract (all set → signed; none → explicit `UNSIGNED DRY RUN`; partial → non-zero) is exactly right and matches the iOS build.sh convention — a half-configured release fails loudly rather than shipping an ambiguously signed artifact.

**Verdict: KEEP (LOW).** The real cost is decision 9 (a third hand-written client), not the framework choice. The ADR is honest about what the container does and doesn't prove.

## 2. Two desktop sign-in paths; bearer-token clients against a cookie-only contract

**The situation.** The Mac shell now has (a) the working path: web-session SSO where `navigation.rs` admits exactly one configured IdP origin into the WebView and `host.rs::require_first_party` denies host commands to any non-app-origin caller; and (b) a complete native path: system-browser PKCE, loopback listener, state/replay/expiry rejection, Keychain refresh storage — terminating in `ContractPendingExchange`, which always returns "endpoint not available yet." Windows and iOS are native-UI clients that *only* have path (b), against a contracts/v1 that is cookie+CSRF only. Meanwhile `apps/native/auth-contract-proposal.md` says root **selected the WebView-cookie path for first release and superseded the native-token design**.

**Simulation.**
- *Compromised or spoofed IdP page:* path (a) renders the IdP inside a WebView with no URL bar — the user cannot verify where they are typing credentials. The mitigations are real: `is_approved_navigation` is exact-origin (ports, scheme, lookalikes tested), host commands are per-command origin-checked, and the init script exposes nothing on the IdP page. But an attacker who compromises the IdP page itself still harvests credentials invisibly; the system browser of path (b) is strictly better here. This is the classic embedded-user-agent tradeoff RFC 8252 warns about, accepted deliberately for release 1. Acceptable, but it should be written down as an accepted risk, and it currently is only implied.
- *Revoked user:* path (a) fails closed — the server owns the cookie session, so revocation stops the next request on all WebView clients (DESK-05). Path (b)'s stored Keychain refresh token has *no server that ever issued it* today, so revocation semantics are untestable; the contract proposal's requirements (rotation, session fencing, `pending` logout) are all still open. Windows/iOS users today get "exchange not available" at sign-in — honest, but it means two of the four shipped clients cannot sign in at all except iOS's cookie-reuse fallback (`GET /v1/session` if a cookie exists, which native-UI apps won't have).
- *Server contract change:* when the token-exchange endpoint finally lands, it must simultaneously satisfy three independently hand-written validators (Rust `auth.rs`, C# `LoopbackAuthenticator`/`AuthCallbackValidator`, Swift `OIDCAuthFlow`). Any divergence (e.g., the Rust parser's RFC 9207 `iss` requirement noted in the proposal) becomes three divergent failure modes. This interacts directly with decision 9.
- *Maintenance:* the Mac shell permanently carries both paths. `auth_begin_login` is reachable from the UI; a future contributor can plausibly believe native login works and build on it. The code is honest at runtime, but the dead path is ~400 lines of security-critical machinery whose server half is unreviewed and unimplemented — the highest-risk kind of speculative code under the AGENTS.md YAGNI rule.

**Verdict: CHANGE-LATER (HIGH).** The working release path (a) is correctly designed. The problem is sequencing: three clients' worth of PKCE front-halves were built before the token-exchange contract was accepted, against a standing root decision that supersedes native tokens for first release. Concretely: (1) do not extend the native path further until the server contract from `auth-contract-proposal.md` is accepted; (2) record the embedded-WebView IdP risk acceptance explicitly; (3) when the contract lands, define it as a single versioned wire spec with shared conformance fixtures consumed by all three clients (see decision 9) before any client-side changes.

## 3. Mac update rollback

**Alternatives:** trust tauri-plugin-updater alone (no rollback); staged channel with manual rollback; the chosen archive + marker + health-ping design.

**Simulation.**
- *Failed update that launches but never becomes healthy:* update installs → marker written `ready:false` → next launch, `post_launch_action` sees a non-ready marker and an archive → `restore_previous_bundle` moves the broken bundle aside before renaming the archive in, so a failed restore can never leave zero bundles. `host_ready` is correctly origin-gated so an IdP page load cannot fake health. This path is well designed and tested.
- *Failed update that cannot launch at all* (corrupt binary, Gatekeeper kill): the rollback decision runs inside the *new* binary at startup. If it never executes, the marker sits at `ready:false` forever and nothing restores the archive. The user is left with a dead app and a valid previous bundle sitting unused in Application Support. No alternative pure-client design fully fixes this (that's what a separate watchdog or OS-level installer transaction buys), but the limitation is nowhere stated — the README/docs imply rollback covers failed updates generally.
- *Slow first launch:* `READY_WINDOW_SECS = 60` is documented ("must report ready within this window or the update counts as failed") but `post_launch_action` never reads `installed_at_epoch_secs` and nothing else consumes the constant (`update.rs:15`, confirmed unused in `lib.rs`). In practice the window is "until the next relaunch", which is actually the *safer* semantics — but the constant and its doc comment describe behavior that does not exist. Under the project's own "outdated comments are worse than none" rule this is a defect.
- *Update while busy:* the busy gate blocks install over an unsaved draft or in-flight send and never forces — matches DESK-02 and the end-goal doc. Caveat: `SharedBusy` defaults to not-busy, so if the WebView never finished loading (and thus never reported busy state), a menu-triggered update proceeds against an app in an unknown state. Low likelihood, worth a note.
- *Disk:* `archive_current_bundle` copies the whole .app (hundreds of MB for a Tauri bundle) into app-data on every update and deletes it on the next healthy launch. Acceptable for 10 users; fine.

**Verdict: CHANGE (MEDIUM).** Keep the architecture; fix the dead `READY_WINDOW_SECS` (either enforce it or delete the constant and correct the marker docs) and document the cannot-launch gap in the release runbook so a human knows the archived bundle exists and where.

## 4. Typed ports + "unavailable" production states vs waiting for the backend

**Simulation.**
- *Release with partial backend:* ConnectionsPage, Bounces/Suppressions and the assistant panel all render explicit unavailable states in production (`featureGateways.tsx` deliberately leaves `connectorGrants`/`deliveryReports` unset; the ConnectionsPage unavailable copy plainly says no connection can be created). Nothing silently falls back to fixtures — the anchor "an omitted capability must stay unavailable rather than switch to fixture data" is the single most important invariant for this project's evidence culture, and it is held.
- *Server contract change before implementation:* every proposed shape is a single client-side spelling (`connectorGrantsContract.ts`, `deliveryReportsContract.ts`) with strict zod objects, byte budgets, and `AIDEV-NOTE: contract-request` anchors pointing at `docs/contract-requests.md`. When the backend implements differently, there is exactly one file per contract to change and validation fails loudly rather than rendering garbage. This is the right shape of speculation: typed boundaries, no fake behavior.
- *Risk:* strict zod (`strictObject`) means a backward-compatible server *addition* (new field) breaks the client. That's a deliberate tradeoff consistent with "validate at boundaries / fail fast"; it just means contracts must be versioned additively on the server side, which the project already mandates.

**Verdict: KEEP (LOW).** This is the correct resolution of "build UI now vs wait": the UI's honest-unavailable discipline converts speculative work into reviewable contract requests instead of invented success.

## 5. Send-status polling vs server push

**Simulation.**
- *120-mailbox org, many open status pages:* worst case one request per open tab per 30s against a session-authenticated read — trivially fine for a Rails API at this scale. SSE/WebSocket push would add a connection-management, auth-over-socket and worker-fanout design for a product whose entire company is ~10 people; clear YAGNI win for polling. Backoff 4s→30s, stop on terminal state, stop while hidden, reset on visibility — all correct and ref-based so re-renders don't reset the schedule.
- *Transient network failure:* `run()` on a failed outcome simply `return`s — it never re-arms. One dropped request (laptop lid, wifi blip that the request layer surfaces as failure rather than offline) permanently halts automatic polling; the page silently shows stale state until the user notices the manual Refresh button. For a screen whose whole point is "watch an ambiguous send resolve", silently going stale is the worst failure mode. A bounded retry (e.g. re-arm at `POLL_MAX_MS` up to N consecutive failures, then surface "status may be stale") preserves the deliberate-stop semantics without the silent stall.
- *Hidden tab returning:* visibility handler resets `step = 0` and re-arms — good; a returning user gets a fresh 4s check.

**Verdict: KEEP the polling decision (vs push); CHANGE the failed-poll dead-stop (MEDIUM).**

## 6. Connections screen and the assistant bridge boundary

**Simulation.**
- *Grant creation:* the secret is returned once, held only in component state, shown in a modal that says plainly it cannot be re-shown, with revoke-and-regrant as the recovery path — matches the design doc's "store only a one-way hash server-side, show once" requirement before the server even exists.
- *External-AI disclosure:* a standing page-level warning plus a per-connection and per-mailbox notice naming the client and stating that content leaves for the AI provider when it reads. This satisfies STANDARDS §7's disclosure intent at the right altitude — at the moment of granting and persistently on the grant, not buried in help text.
- *Compromised web page / malicious email trying to reach the bridge:* the AssistantPanel path is web → zod-validated `window.elevateoDesktop` capability → named Tauri commands → `require_first_party` origin check → (future) native adapter. Capability detection is by typed shape, never user-agent; invalid bridge events are dropped, never rendered; output is plain text only. Email content cannot reach the bridge because commands carry only booleans/runtime names/status strings (host.rs header comment, and the surface confirms it). This is DESK-04 done properly.
- *Scope note:* `CONNECTOR_SCOPES` is read/draft only — no send scope exists even in the proposed contract, matching the MCP policy in STANDARDS §7.

**Verdict: KEEP (LOW).**

## 7. iOS: ElevateoCore package + committed hand-written pbxproj

**Simulation.**
- *No macOS host in the build environment (the actual situation):* the split is what makes any iOS verification possible at all — PKCE, API validation and draft logic build and test on Linux in Docker (`Dockerfile.core`), and the README states plainly that the app target has never been built. Without the split, the entire iOS lane would be unverifiable source.
- *Project drift:* committing both `project.yml` and a generated-equivalent `project.pbxproj` creates a two-source-of-truth pair. The alternative — XcodeGen at build time — would make `build.sh` depend on a tool that doesn't exist in the Linux container and adds a mutable dependency to the only step that already requires a Mac. Committing the pbxproj with the sync anchor (`project.yml:1`) is the lesser evil; a one-line check in `build.sh` (regenerate and diff when XcodeGen is present) would close the drift hole cheaply.
- *New source file added by a future contributor:* they must touch both files or Xcode builds diverge from the spec — exactly the kind of coupling the anchor rule exists for, and the anchor is present.

**Verdict: KEEP (LOW).**

## 8. Android: Tauri WebView over the web origin, KVM-gated emulator acceptance

**Simulation.**
- *Revoked user / logout:* the cookie session means server-side revocation is immediate on next request for Android exactly as for web — the strongest DESK-05 story of any client, with no token store to invalidate. The same-origin design also means the SSO fix (decision 2a's IdP-origin allowance) applied to Android for free, as the README's 2026-10-29 audit records — one navigation policy, two platforms.
- *A second native Android UI instead:* would re-raise every issue in decisions 2 and 9 (fourth API client, fourth PKCE, token storage in Keystore) for the lowest-priority client. The removed "old Java offline activity" confirms the right direction was already taken.
- *Acceptance without KVM:* `emulator-acceptance.sh` exits 3 fast rather than running an uselessly slow unaccelerated emulator and timing out ambiguously; non-automatable cases are recorded NOT_RUN with reasons. Both behaviors preserve the project's evidence honesty — nothing claims device behavior from a fixture origin, and the README says so explicitly.

**Verdict: KEEP (LOW).**

## 9. Duplication: three API clients and three PKCE implementations

**Simulation.**
- *contracts/v1 adds a field or changes a status enum:* four independent validators (web zod, Rust, C# `System.Text.Json` source-gen context, Swift Codable) must change in lockstep. At the current contract surface (session, mailboxes, threads, drafts) that's tractable; each client's validation is strict, so divergence fails loudly rather than corrupting state. The dangerous divergence is auth (decision 2), where a subtle difference — the Rust parser requiring RFC 9207 `iss` where C#/Swift may not — produces platform-specific login failures that look like server bugs.
- *Shared codegen now:* STANDARDS §1 explicitly chose "versioned wire contracts across languages rather than shared TypeScript domain code," and an OpenAPI-to-three-languages codegen pipeline is a real infrastructure project (toolchain pinning, generated-code review, per-language idiom fights) for a contract that is still growing and partly unimplemented. Building it now, before the token-exchange and connector-grant contracts even exist server-side, would be generating against speculation.
- *Cheap middle ground available now:* a shared, language-neutral conformance fixture set (canonical JSON request/response samples + PKCE/callback vectors checked into `contracts/`) that all four test suites consume. The test suites already exist in each language (xUnit, XCTest, Rust `#[cfg(test)]`, vitest); pointing them at common fixtures catches drift without any codegen.

**Verdict: KEEP for now, with the shared-fixture step as the bounded change (MEDIUM).** Revisit codegen only when the contract count or client count grows.

---

## Defects

1. **`apps/native/src-tauri/src/update.rs:15` — dead, misleading constant.** `READY_WINDOW_SECS` and its doc comment ("the next launch must report ready within this window or the update counts as failed") describe enforcement that does not exist: `post_launch_action` never reads `installed_at_epoch_secs` and nothing consumes the constant. Violates the AGENTS.md/STANDARDS rule that comments must match behavior. Enforce the window or delete the constant and correct the `LaunchMarker` docs.
2. **`apps/web/src/features/send/SendStatusPage.tsx` (poller `run()`, ~line 185) — a single failed poll permanently stops automatic polling with no user-visible signal.** On a transient request failure the schedule is never re-armed and the page silently shows stale status; for an "unknown send" watch screen this is a correctness-adjacent UX failure. Add bounded failure retries or a visible "status may be stale — refresh" state when auto-polling stops.
3. **`apps/native/src-tauri/src/auth.rs` + `host.rs` (`auth_begin_login`, Keychain refresh storage) — ~400 lines of security-critical native login shipped against a superseded design with no server contract.** `auth-contract-proposal.md` records that root selected WebView-cookie auth for first release and that the prior native-token modules were *removed* in 625bef1; this change reintroduces an equivalent native path (plus C# and Swift twins) terminating in `ContractPendingExchange`. Runtime behavior is honest, but this is speculative security surface contrary to the recorded decision and the YAGNI floor. Either obtain an explicit root acceptance of the revived native path (updating the proposal doc) or gate `auth_begin_login` out of release builds until the exchange contract is accepted.
4. **Rollback cannot fire when the updated binary never launches (`apps/native/src-tauri/src/lib.rs:103`, `update.rs`).** The rollback decision executes inside the new binary's startup; a binary that is corrupt or Gatekeeper-blocked leaves the marker at `ready:false` and the good archive stranded, with no documentation telling an operator the archive exists. Document the manual-restore path in the release runbook (the dmg release script's docs are the natural home).
5. **Embedded-WebView IdP login risk is undocumented as an accepted tradeoff (`apps/native/src-tauri/src/navigation.rs`).** Allowing the IdP origin inside the WebView means credentials are typed into a window with no verifiable address bar — the exact risk RFC 8252 cites and the reason path (b) uses the system browser. The technical mitigations (exact-origin allowlist, per-command origin guard, nothing injected on the IdP page) are implemented and tested, but the risk acceptance itself exists only implicitly in an Android README audit note. Record it where the auth design lives.
6. **Cross-client auth validation divergence risk (decision 9, MEDIUM, preventive).** Rust requires RFC 9207 `iss` on callbacks per the contract proposal; the C# and Swift callback validators were written independently. Before the token-exchange endpoint ships, add shared conformance vectors under `contracts/` consumed by all three auth test suites so the three validators provably accept/reject the same callbacks.

**Defect count: 6** (1 HIGH-severity design defect — #3; 3 MEDIUM — #2, #4/#1 jointly on the update story, #6; 2 LOW/documentation — #1, #5). Against the ~2,200 lines actually read in depth, that is ~2.7 defects/KLOC of reviewed code; these are design findings, not line-bug density, and are not comparable to the adversarial reviewers' numbers.

## Lines/scope read

Read fully: `navigation.rs` (75), `host.rs` (267), `update.rs` (249), `bridge.ts` (135), `featureGateways.tsx` (68), `connectorGrantsContract.ts` (88), `SendStatusPage.tsx` lines 1–200, `apps/windows/README.md`, `apps/ios/README.md`, `apps/android/README.md`, `auth-contract-proposal.md`, `.planning/STANDARDS.md`, `docs/desktop-and-connectors.md`, `docs/end-goal.md`, AGENTS.md top. Grepped/spot-read: `ConnectionsPage.tsx` (secret/disclosure sections), `auth.rs` (anchors and exchange port, not the full 402 lines), `lib.rs` (marker usage lines only), `ElevateoApiClient.cs` and `IAgentsBridge.cs` anchors, `project.yml` header. Roughly **1,900–2,300 lines of the ~9,900-line change read directly (~20–23%)**, selected per decision; the Windows ViewModels, iOS SwiftUI views, Android build scripts, delivery-reports contract/pages and the full `auth.rs`/`macos-release.sh` were judged from READMEs, anchors and greps only. Obsidian background notes were not loaded (past review date; the binding sources above sufficed).
