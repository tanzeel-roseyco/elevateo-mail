# Fable FE-805 — shared shell, sidebar, router seam, styles, UI primitives, brand

Officer FE805, Frontend team. Branch `completion/fable-fe805`, isolated Orca worktree cloned from fleet baseline `bbf2353b254a05d48c2da7a508c143e6fba78691`. R1 candidate `dc1db826d73683be13e201c04908fa24d3377b97`; R2 (integrated wiring) candidate is the commit that updates this section, reported in `control/fable-outbox.md`. Model: Claude Fable 5.1 (`claude-fable-5-1`, effort low, per the Orca launch record).

NO LIVE SPEND. No local builds, tests or Docker were run; every check below is **requested**, not executed.

## Scope delivered (owned paths only)

| Path | Change |
| --- | --- |
| `apps/web/public/brand/logo-icon.png` | Authentic Elevateo mark, byte-identical to root's supplied asset (SHA-256 `325d418f557e692314ee5c6cc56c2aa2baabb934527513b7080fabfa234922f4`). |
| `apps/web/public/brand/elevateo-logo.png` | Authentic full lockup, byte-identical (SHA-256 `a0a9b2606c76621bae1e792e976d4c092100cf4c11dfb415dca0867eb3e384d2`). Shipped for later use (sign-in/auth pages are not in FE-805 scope); not referenced by the shell yet. |
| `apps/web/src/ui/BrandMark.tsx` | New primitive: renders the PNG mark at a fixed intrinsic ratio on a theme-independent dark neutral tile. No CSS filters, no redraw. |
| `apps/web/src/styles/index.css` | One new token `--brand-tile` (#0a0b0f, from the public homepage surface) exposed as `bg-brand-tile`. Nothing else changed. |
| `apps/web/src/app/featureRegistry.ts` | Pure, React-free registry: validates feature ids, route paths and nav entries; groups nav by section (`personal` / `outreach`). Fails loud with `FeatureRegistryError`. |
| `apps/web/src/app/features/index.tsx` | The single registration point for Mira/Celeste/Lyra feature exports. Currently registers the Outreach seam (`/outreach/campaigns`, `/leads`, `/accounts`, `/analytics`) bound to a truthful placeholder page. |
| `apps/web/src/app/features/FeaturePlaceholderPage.tsx` | Placeholder that states the module is not integrated in this build; no simulated data. |
| `apps/web/src/app/Sidebar.tsx` | Two independent `nav` landmarks, **Personal** (search, mailboxes with capability sub-links, optional personal feature links) and **Outreach** (registered links; hidden when empty). No global switcher. Brand header uses `BrandMark`. |
| `apps/web/src/app/Shell.tsx` | Passes registry sections to the sidebar; shows the mark in the mobile header where the rail is hidden. Drawer name/trigger label unchanged. |
| `apps/web/src/app/App.tsx` | Mounts registered feature routes inside the protected shell before the catch-all redirect. Existing routes untouched. |

Existing auth/session boundaries are untouched: the gate in `Shell.tsx` still renders nothing protected while non-ready, and feature routes sit under `ProtectedShell`.

## Brand inspection

Root supplied `brand/provenance.md`, `logo-icon.png` (2487x2348 RGBA) and `elevateo-logo.png` (757x600 RGBA), downloaded from elevateoco.com. Both files were hashed after copying and match the provenance table. Following that guidance: the icon is used for compact identity at 28 px (rail) and 24 px (mobile header), height from the intrinsic ratio, `object-fit: contain`, on a dark tile in both themes. `alt=""` where the visible text "Elevateo Mail" sits beside it; `alt="Elevateo"` in the mobile header where it is the sole identification. The public homepage palette (`#d4af37` gold, `#080a0e`/`#0a0b0f` surfaces) informed only the tile colour; the existing accent tokens were not changed.

## Exported interfaces for other owners

```ts
// apps/web/src/app/featureRegistry.ts
type FeatureSection = 'personal' | 'outreach'
interface FeatureNavEntry { path: string; label: string; section: FeatureSection; order: number }
interface FeatureRegistration { id: string; routes: readonly string[]; nav: readonly FeatureNavEntry[] }
// apps/web/src/app/features/index.tsx
interface FeatureModule extends FeatureRegistration { elements: Readonly<Record<string, ReactElement>> }
```

Integration seam: a feature owner exports a `FeatureModule` from their own path (for example `apps/web/src/features/outreach/index.tsx`) and requests, via the control outbox, that Fable add it to `FEATURE_MODULES` and remove the matching placeholder. Route paths must match `/^\/[a-z0-9-]+(\/([a-z0-9-]+|:param))*$/`; duplicates across owners fail at module load. Scoped style requests go through Fable; nobody else edits `styles/index.css` or the shell.

## Dependencies

No new dependencies. `react-router` 7.18.4, `@radix-ui/react-dialog`, Tailwind 4 and vitest were already pinned.

## Tests added (requested, not executed)

- `featureRegistry.test.ts`: happy path (section grouping and stable ordering); failure: duplicate route path across modules; failure: malformed paths, nav without route, empty id, blank label.
- `Sidebar.test.tsx`: happy path (two landmarks, authentic mark, no switcher); nested Outreach path keeps parent highlighted but not `aria-current`; empty Outreach registry hides the section while Personal sub-links still work.
- `Shell.test.tsx`: new case reaching the Outreach placeholder inside the protected shell with the rail link current. All 24 pre-existing Shell cases are kept; the drawer still exposes `dialog "Mailboxes"` and `button "Open mailbox menu"` because `apps/web/e2e/read.spec.ts` (QA-owned) depends on them.

## Test request for Soren QA815 (fleet-02 only)

```sh
# from the integration root after fetching completion/fable-fe805
docker build -f apps/web/docker/test.Dockerfile -t elevateo-web-test-fable-fe805 .
docker run --rm elevateo-web-test-fable-fe805
# then task-owned cleanup
docker image rm elevateo-web-test-fable-fe805
```

The recipe runs `check:api`, `lint`, `typecheck`, `vitest --coverage`, `build` and the fixture-marker grep. Expected affected files: `src/app/featureRegistry.test.ts`, `src/app/Sidebar.test.tsx`, `src/app/Shell.test.tsx`. Also please report `ls dist/brand` to confirm both PNGs are copied by Vite.

## Screenshot requirements for Tessa QA816

1. Desktop 1280x800, light and dark theme: rail with brand header, **Personal** (Search, Fixture inbox with Drafts/Members sub-links on the fixture mailbox) and **Outreach** (Campaigns, Leads, Accounts, Analytics). Confirm the gold mark is legible on the dark tile in both themes.
2. Mobile 375x812: header shows the mark next to the organization name; open the drawer and capture both sections inside the dialog.
3. `/#/outreach/campaigns`: placeholder page copy "Campaigns is not available in this build" with the Campaigns link highlighted and `aria-current="page"`.
4. Keyboard: Tab from the skip link through Personal into Outreach; focus ring visible on each link.

## Design tradeoff simulations for root

- **Registry at module load vs. runtime context.** Chosen: build-time constant validated on import. Simulation: Celeste registers `/outreach/leads` twice by mistake; the test run and Vite build throw `FeatureRegistryError` naming the path. A runtime context would render whichever route won and hide the clash. Cost: adding a module needs a Fable edit; accepted because ownership rules already require that.
- **Two sections vs. a global Personal/Outreach switch.** Chosen: both lists always visible. Simulation: a user deep-links to a campaign while reading mail; with a switcher the rail state could disagree with the URL after reload. With two lists, the URL alone decides, and nothing is stored.
- **Theme-independent brand tile vs. theme-adaptive mark.** Chosen: fixed dark tile. Simulation: light theme on white; gold `#d4af37` on `#ffffff` is roughly 1.9:1, unreadable, while gold on `#0a0b0f` is above 10:1. A redrawn dark variant would not be the official asset.

## R2 — actual feature wiring (2026-10-15)

Exact owner commits merged into this branch with `--no-ff` and untouched source (shared-doc conflicts resolved as a union of both owners' sections):

| Owner | Exact commit | What it brings |
| --- | --- | --- |
| Celeste FE-807 | `152f95a808d03e2dd9eb7671fff58f0863d51c5e` | `OutreachCampaignsPage/LeadsPage/AccountsPage/AnalyticsPage` with `OutreachReads` boundary |
| Lyra FE-808 | `6f55a014cfc580b8a5159fbf3813411eabd8ecb1` | `AdministrationPage({ gateway: AdminGateway, section })`, `adminModel` |
| Mira FE-806 | `e31da546a3e24d130c3b9b0e271604492fc292e6` (includes `140218de`) | inbox compose entry and per-message reply prefill on existing routes |
| Cassian INT-801 | `79476c313edfb2e571f8a5ef30b42619af2226f4` | browser V2 gateway port, strict V2 boundaries, transport admits `/v2/` |

Fable changes in R2 (owned paths):

- `src/app/featureGateways.tsx` (new): `FeatureGateways { outreach?: OutreachReads; admin?: AdminGateway }` context plus `FeatureGatewaysProvider`/`useFeatureGateways`. `App` accepts an optional `featureGateways` prop; `main.tsx` passes `{}`.
- `src/app/features/index.tsx`: placeholders removed. Outreach routes render Celeste's real pages with the session `context` and the optional `outreach` reads; `/people` and `/settings` render Lyra's `AdministrationPage` when `admin` exists, otherwise `FeatureNotConnectedPage` (new, replaces `FeaturePlaceholderPage`).
- `src/app/featureRegistry.ts`: third section `organization` and exported `FEATURE_SECTIONS` ordering (Outreach, Organization).
- `src/app/Sidebar.tsx`: renders Personal plus every non-empty registered section as its own landmark via one `sections` prop. Still no mode switcher.
- `src/styles/index.css`: base-layer `border-color: var(--line)` so owner pages that use bare `border`/`divide` utilities share the shell hairline in both themes.
- Tests: `features/index.test.tsx` (3 cases: Outreach happy path through the provider; admin absent; Lyra page through the real protected session), updated registry/sidebar/shell cases. Total authored FE-805 cases: 10. None executed by Fable.

### Gateway reconciliation (why `featureGateways` is empty in production)

- Cassian's V2 has no Outreach read endpoints; only `createOutreachCampaign`. Celeste's `OutreachReads` (list campaigns/leads/accounts/analytics) cannot be served, so her pages show their own "unavailable until the Outreach API is connected" status. Request to Cassian/Dorian: additive `GET /v2/outreach/{campaigns,leads,accounts,analytics}` returning `{ items: [...] }` matching `features/outreach/contract.ts`.
- Cassian's `OrganizationGrantsSchema` is `{ revision, grants: [{ organization_id, user_id, role(3 values), revision }] }`; Lyra's `AdminGateway` expects `{ revision, can_manage_grants, people[12 unbound, person_key], grants[{ person_key, role(7 values) }] }` and `replaceOrganizationGrant(ctx, proof, personKey, role, expectedRevision)`. Request to Cassian/Lyra/Theo: agree one snapshot DTO; Fable will then add a ~15-line adapter in `main.tsx` from `createV2Gateway()` to `AdminGateway` and remove the not-connected state. No adapter is shipped now because it would turn a shape mismatch into a misleading "could not be loaded" error.
- V2 routes are disabled server-side (contracts/v2/README.md), so even a reconciled adapter would read 404 today.

### Updated test request for Soren QA815

Same recipe as R1 on the R2 SHA. Expected affected files: `src/app/featureRegistry.test.ts`, `src/app/Sidebar.test.tsx`, `src/app/Shell.test.tsx`, `src/app/features/index.test.tsx`, plus the merged owner suites (`features/outreach/*.test.*`, `features/members/*.test.*`, `features/inbox/InboxPage.test.tsx`, `features/thread/*.test.tsx`, `data/v2Contract.test.ts`).

### Updated screenshot requirements for Tessa QA816

1. Desktop 1280x800 light and dark: rail with Personal (Search, mailboxes), Outreach (Campaigns, Leads, Accounts, Analytics) and Organization (People, Settings); gold mark legible on the dark tile.
2. `/#/outreach/campaigns`: Celeste's page heading plus "Campaigns are unavailable until the Outreach API is connected", link current in the rail; confirm the hairline borders match the shell.
3. `/#/people`: "People is not connected in this build" with the Back to mail link.
4. `/#/mailboxes/<fixture>`: Mira's "Compose draft" link beside Conversations when compose capability is true.
5. Mobile 375x812: header mark, drawer showing all three sections.

## R3 — owners' full modules registered (2026-10-15)

Further exact owner commits merged `--no-ff`, source untouched, shared docs unioned: Lyra `77a86fed836d8f7da6d6cd1ac32902a1004e586b` (`peopleFeatureModule`: `/people`, `/settings/personal`, `/settings/organization`, all in the Personal section; `AdministrationPage` now binds Cassian's `createV2Gateway()` itself), Celeste `efc609b00cd9042c70e343d287fe8979781aeb67` (`createOutreachFeatureModule(props)`: ten routed campaign/lead/account/analytics workflows, four nav entries, draft/paused only), Mira `e120b308d7d54cb4824eb9f49406c7b716e3f21a` (message permalinks on existing routes).

Fable changes in R3:

- `features/index.tsx` registers `peopleFeatureModule` verbatim and wraps Celeste's module: each of her ten paths is an `OutreachRoute` that reads `context`/`proof` from `useProtectedRequest()` and the optional `OutreachGateway` from the feature-gateway seam, then renders her element. Nothing is placeholder any more; `FeatureNotConnectedPage` is deleted.
- `featureGateways.tsx` narrows to `{ outreach?: OutreachGateway }` (Lyra needs no seam).
- `featureRegistry.ts` drops the unused `organization` section; Personal now lists mailboxes followed by Lyra's People / Personal settings / Organization settings.
- Tests: `features/index.test.tsx` rewritten (registration shape; Outreach happy path through a full `OutreachGateway`; Celeste's own unavailable state with no gateway; Lyra's personal settings from the live fixture session). Registry/sidebar/shell cases updated. FE-805 total: 11 cases, none executed.

Gateway reconciliation now reduces to one item: Cassian/Dorian publish an `OutreachGateway` adapter (ten operations in `features/outreach/contract.ts`) over additive V2 routes; Fable then passes it from `main.tsx` in one line. Lyra's V2 grant reads remain disabled server-side, so `/people` and `/settings/organization` show her denied/error states until Sabine/Theo/Cassian activate the route.

Updated Soren request: same Docker recipe on the R3 SHA; expected FE-805 files `featureRegistry.test.ts`, `Sidebar.test.tsx`, `Shell.test.tsx`, `features/index.test.tsx`, plus all merged owner suites. Updated Tessa items: Personal rail shows Search, mailboxes, People, Personal settings, Organization settings; `/#/outreach/campaigns` shows Celeste's heading, "Create draft campaign" link and the unavailable status; `/#/settings/personal` shows "Signed in as"; `/#/people` shows Lyra's denied or error state (not a crash); mobile drawer with both sections.

## R4 — online-only mobile/WebView shell UX (2026-10-15)

Merged exact owner heads `--no-ff`, untouched: Celeste `7a26ce3b235297ffaf4a525ac8ce863e6c5c8f48`, Lyra `849f63d6c38524caadddae1e307293d6de9d81f8`, Mira `0f3ae5cfae1acc6e4470da4cf40b0405b52c473f`. Cassian's inert Outreach V2 routes (`cb771ca`) and grant routes (`11ee31b`) are noted; he owns the browser adapter and session invalidation, so `featureGateways` in `main.tsx` stays `{}` until his adapter lands (one-line wiring then).

Shell changes (owned paths), built for the initial native shape: exact HTTPS WebView over the existing cookie session, no native IPC, token storage or PKCE.

- `ui/ConnectivityBanner.tsx` (new) with `useConnectivity()`: offline drop shows an honest notice (no cache, content may be stale, no action); a return shows "Connection is back" with an explicit **Reload** (calls the session `refresh()`, which re-bootstraps through the existing gate) or **Dismiss**. Nothing refetches automatically; `navigator.onLine` is never presented as proof of connectivity.
- `Shell.tsx`: banner between header and main; route-change hygiene scrolls `#main` to the top and moves focus to it only when focus is stranded on `<body>`. Focus owned by a page (reader heading, editor field, Mira's pagination) or restored by Radix to the drawer trigger is left alone, so `e2e/read.spec.ts` focus assertions still hold.
- `styles/index.css`: `#root` uses `min-height: 100dvh` plus safe-area insets; coarse-pointer devices get 44 px rail/drawer/header targets. Request to the host owner: add `viewport-fit=cover` to `index.html`'s viewport meta (not a Fable path) so the safe-area insets take effect under notches.
- Logout and back: sign-out already unmounts the keyed protected subtree (drawer, banner and page state included) before the request; the hash router gives the WebView back button ordinary history. No background sync exists, so a killed WebView loses only unsaved editor text, which the existing draft-intent provider already scopes to the session.

Drawer rename proposal for Tessa (not applied; her `read.spec.ts` and QA818 depend on today's names): trigger `button "Open navigation menu"`, `dialog "Navigation"`. Fable will change `Shell.tsx` in the same integration commit as her selector update once she confirms.

Tests added (not executed): `ui/ConnectivityBanner.test.tsx` (online no-op, offline then reload, pre-offline start then dismiss) and two Shell cases (route-change focus/scroll rules; offline notice inside the shell with reload re-bootstrap). FE-805 total: 16 cases.

Screenshot requirements for Tessa, R4: widths **390, 768 and 1440**, light and dark, each with (a) populated fixture inbox, (b) empty mailbox list, (c) load error in the rail with Try again, (d) denied mailbox page; plus offline notice (DevTools offline) and the restored-connection bar at 390; the drawer at 390 showing Personal and Outreach. No visual PASS will be claimed without these images.

## R5 — real Outreach gateway injection, ADV033 fix, drawer rename (2026-10-15)

Source intake: Cassian's exact V2 web chain was cherry-picked with `-x` provenance because his integration head carries every lane and must stay the single integration branch: `12e7388`, `bbed59c`, `c281768`, `cb771ca`, `77ace94` (adds `data/v2OutreachGateway.ts`). Three server files and `docs/completion/cassian.md` conflicted and were taken at Cassian's version; the server tree on this branch is therefore **not** an integration candidate, only Cassian's branch is. Celeste `4372e28` was already contained.

- **Production injection.** `main.tsx` now passes `bridgeOutreachGateway(createV2OutreachGateway())` as the Outreach feature gateway. `app/outreachGatewayBridge.ts` types the wiring against Celeste's `OutreachGateway` port: campaign, lead and analytics operations pass straight through; the two account operations drop the campaign id because the adapter is still unscoped and rejects them inertly with `temporarily_unavailable`. Delete the bridge once Cassian's adapter takes campaign-scoped account signatures. Tests: `outreachGatewayBridge.test.ts` (campaign read through the adapter; inert account calls with no dispatch; malformed lead write rejected before network).
- **ADV033 (Shell 270 LOC, confirmed).** The "Simulated local mail" badge and the rail footnote are now rendered only when the authoritative session flag `simulation_mode` is true, and the footnote no longer claims local-only storage: "Simulation mode: no mail is sent or received. Drafts and notes are saved on the server." `Sidebar` accepts `footnote: string | null`. Regression: Shell case asserting the new copy and the absence of the old claim. The V1 schema pins `simulation_mode` to `true`, so the false branch cannot be exercised by fixture until the contract admits it.
- **Drawer rename (agreed).** `dialog "Navigation"`, `button "Open navigation menu"` in `Shell.tsx`; Shell tests updated. Tessa updates `e2e/read.spec.ts` and QA818 selectors to the same names.
- ADV031 (registration, 0 defects) and ADV032 (Sidebar, 0 defects) acknowledged; actual visual and session-replacement runtime evidence remain Soren/Tessa gates.

FE-805 authored cases: 20. None executed by Fable.

## R6 — exact drawer labels, e2e alignment, viewport-fit (2026-10-15)

Narrow repair on `77dbd86`: trigger `button "Open navigation"` (no "menu"), `dialog "Navigation"`; the rail landmark is `navigation "Personal"`. `Shell.tsx`, `Shell.test.tsx` and the affected `e2e/read.spec.ts`, `e2e/support.ts`, `e2e/visual-states.spec.ts` selectors changed in the same commit so Tessa's exact labels and the repository specs agree. Fixed the `Shell.test.tsx` test-title apostrophe (now a double-quoted title) that would have failed to parse. Added `viewport-fit=cover` to `index.html` and `dev-fixtures.html` so the safe-area insets in `styles/index.css` apply in notched WebViews. Account-gateway note for Cassian: the bridge's two inert account signatures should be replaced by his canonical campaign-scoped signatures when the real account route is registered; no inert workaround is intended once that route exists. Nothing executed locally.

## R7 — fleet lint failure web93f7 and canonical account port (2026-10-15)

Fleet lint on the previous candidate reported six unused `_input`/`_init` parameters in `outreachGatewayBridge.test.ts`. Rather than silence lint, the bridge and its test are deleted: Cassian's adapter now exposes campaign-scoped account signatures (exact chain cherry-picked with `-x`: `9076a73`, `31c3396`, `2fc1b18`, `be12a48`, `ba5b8a5`), so `main.tsx` passes `createV2OutreachGateway()` straight through, typed as Celeste's `OutreachGateway` so any future drift fails typecheck instead of being masked. Account reads are still rejected by the adapter with `temporarily_unavailable` and no dispatch until the account route is registered; that is the adapter owner's explicit behaviour, not a Fable workaround. New wiring case: the campaign-scoped accounts route through the real adapter renders Celeste's error state with zero network calls. Conflicting `docs/completion/cassian.md` and `contracts/v2/README.md` were taken at Cassian's version. FE-805 authored cases: 18. Nothing executed locally.

## R8 — central session policy for Outreach operations (2026-10-15)

Confirmed Celeste seam: the raw `createV2OutreachGateway()` injected in R7 meant a 401 or `context_changed` from an Outreach write only locked the local form; `SessionProvider.handleError` never ran, so no refresh, no recovery and no cleared protected subtree. Repair, source only:

- `apps/web/src/app/outreachSessionPolicy.ts` — `policeOutreachGateway(gateway, policy)` wraps every `OutreachGateway` operation (optional `getLead`/`recordConsent` only when present). It reads the request generation at call time and hands every synchronous throw or rejection to `handleError(error, generation)` before rethrowing. No second session state; the one controller in `session.tsx` stays the policy.
- `apps/web/src/app/features/index.tsx` — `useOutreachProps` now takes `scope`/`handleError` from `useSession()` and memoises the policed gateway on the injected port and those stable callbacks. The `OutreachGateway` type is unchanged for Celeste; her `scopeKey(context)` remount still rebinds pages on an epoch change, and Celeste 84982b6 (local `isAccessLoss` guard) is merged exactly as `f849913`.
- Tests authored, NOT executed: `outreachSessionPolicy.test.ts` (3 cases: 401 write reaches the policy with the call-time generation and rethrows; ordinary rejection passes through; sync throw and optional capabilities) and `Shell.test.tsx` (3 cases: 401 from `createCampaign` shows "Restoring access" with form and Outreach rail gone, then access returns; one `context_changed` from `listCampaigns` recovers and the remounted list re-reads; `request_invalid` stays on Celeste's page as her alert with no session transition). FE-805 authored cases now 24, none executed.
- Unchanged: URL grammar, sidebar landmarks, brand, manual simulation label, `main.tsx` production binding. No server files; Cassian intakes the frontend paths listed in the outbox receipt.

## R9 — bind Cassian's exact V2 direct-message reader into App (2026-10-15)

Intake `cdaef1f`: `apps/web` now equals the apps/web tree of Cassian `9ed7218` (which already contains this branch through `09cd4ef`), bringing Mira `1923c16` (`ThreadPage({ readDirectMessage?: DirectMessageRead })`) and Cassian's `createV2Gateway().getDirectMessage(ctx, mailboxId, threadId, messageId, signal)`. No server source taken or changed.

Binding, source only:
- `apps/web/src/app/featureGateways.tsx` — `FeatureGateways.readDirectMessage?: DirectMessageRead` beside `outreach`. Absence keeps Mira's honest unavailable state.
- `apps/web/src/app/App.tsx` — `ThreadRoute` reads the capability and renders `ThreadPage` with a conditional spread (exactOptionalPropertyTypes).
- `apps/web/src/main.tsx` — production `featureGateways.readDirectMessage` delegates to the exact V2 reader; no second adapter and no cursor walk.
- Shared session policy: Mira's page already captures the generation at call time and routes every direct-read failure through `SessionProvider.handleError`. Deliberately NOT wrapped a second time: a double 401 would call `attemptRefresh` twice and spend the single bounded refresh, ending at sign-in. Mailbox/thread mismatch on the response is refused by her page.
- Tests authored, NOT executed: `apps/web/src/app/App.test.tsx` (3 cases on the real App composition and hash deep link: later-page message URL resolves through one direct read with exact arguments and exactly one thread read; a response bound to another mailbox shows the generic unavailable state; a 401 from the direct read clears thread content and lands on sign-in). FE-805 authored cases now 27, none executed.

Known open item, not mine: Soren's exact `2184127` fleet typecheck FAILED in Mira's `ThreadPage.tsx:60` / `ThreadPage.test.tsx:39` (explicit `undefined` for an optional prop) and missing `MB2` in her test. Those blobs are unchanged in this intake; Mira owns that repair, and my `ThreadRoute` spread does not touch her file.

## R10 — fleet 8eb840d repair of the seven FE-805 unit failures (2026-10-15)

Soren's exact receipt `docs/completion/qa815-evidence/web-8eb840d51eaa.txt` (completion-soren-qa815): API/lint/typecheck PASS, 779 unit PASS / 10 FAIL, seven in FE-805 files. Intake `af8dc62` first makes `apps/web` equal the integrated `8eb840d` tree (Mira ff7fa0f ThreadPage typecheck repair); no server source taken.

Diagnosis and repair, semantics unchanged:
- **Shell.test.tsx, three session-policy cases.** Root cause is one line in the first case: `act(() => finishRefresh!())` passed a promise-returning callback without awaiting it. React keeps that act scope open and queues every later update into it, which is exactly the fleet evidence: case 1 froze at "Restoring access" after the refresh was released, and cases 2 and 3 rendered an empty root (`<div />`) because their renders were queued into the leaked scope ("The current testing environment is not configured to support act"). Repair: `finishRefresh` returns the promise and the release is `await act(async () => { await finishRefresh!() })`. Cases 2 and 3 are untouched; the production policy and `outreachSessionPolicy.ts` are untouched.
- **Sidebar.test.tsx.** The Search entry used a text glyph `⌕` in an aria-hidden span, so link `textContent` read `⌕Search`. Repair in source: a first-party `SearchIcon` SVG in `ui/icons.tsx` (aria-hidden like the rest) replaces the glyph; the accessible name was already "Search" and is unchanged, the test is unchanged.
- **collaborationNav.test.tsx.** Stale expectation of the pre-ADV033 footnote; now asserts the exact R5 text "Simulation mode: no mail is sent or received. Drafts and notes are saved on the server."
- **features/index.test.tsx, two cases.** Celeste c49063e registers eleven Outreach routes (account detail added) and maps the adapter's pre-dispatch `temporarily_unavailable` rejection to her own `role="status"` "Outreach API unavailable for this account." The test now asserts eleven routes and that exact status while still asserting fetch is never called.

Celeste owns the remaining three failures (OutreachPages pause/consent, contract consent). Tests remain authored and NOT executed here; focused fleet rerun requested from Soren. No visual claim.

## R11 — Maeve REV866 (MAC-814) stale consumed-error review and regressions (2026-10-15)

Maeve's `mac814-fable-outreach-policy-review-10a64a1.md` raised a potential HIGH: the policy rethrows an error the session controller already consumed (stale generation, current 401, context change), so a page awaiting an old request might commit a stale failure under a replacement context. Exact page catches reviewed (`features/outreach/OutreachPages.tsx` lines 78-83, 132-146, 170-183, 239-261; `ConsentEvidenceForm.tsx` 20-46), not edited:

- Reads run in an effect keyed on `[gateway, context, kind, id, revision, cursor]` whose cleanup aborts the controller; both the success and failure continuations are guarded by `controller.signal.aborted`.
- Writes keep one pending controller aborted on unmount; every catch and finally is guarded the same way.
- Every consuming path in `session.tsx` (stale generation after refresh/recovery/switch/sign-out/bootstrap, current 401 → `refreshing`, context change → `recovering`/`retry_required`) unmounts or remounts the protected subtree, so the page's controller is aborted before its catch can run; a context change alone also re-keys her read effect.

Conclusion: no production bug; the rethrow is required so a consumed failure never resolves into a fake result. Repairs are evidence only: a documenting `AIDEV-NOTE` in `outreachSessionPolicy.ts`, three unit cases Maeve listed as missing (successful pass-through with no policy call, stale consumed 401 still rethrown, current context change reported with its generation), and one route-level regression in `Shell.test.tsx`: a held-open `listCampaigns` from identity A fails with 401 only after an explicit switch to organization B; the test asserts no alert, no "Restoring access", organization B visible, the refresh never called and the remounted page's second read listed. FE-805 authored cases now 31, none executed; fleet run requested from Soren.

## R12 — FE864 bind the optional sequence-draft methods into the session policy (2026-10-15)

Cassian `578baa6e` activates the sequence draft contract: `OutreachGateway` gains optional `getOutreachSequenceDraft` / `saveOutreachSequenceDraft`, the V2 adapter implements both over the guarded Rails draft routes, and Celeste's `SequencePage` renders "unavailable" whenever the method is absent. `policeOutreachGateway` rebuilt the gateway from an explicit method list, so the two new optional methods were dropped and the production page stayed inert. Intake `6b18fb99` takes the exact 578baa6e `apps/web` tree (zero diff, frontend only). The repair adds the two conditional spreads next to `getLead`/`recordConsent` with an `AIDEV-NOTE` that every optional port method must be listed; absence stays absence, and nothing substitutes a fixture. Four unit cases: both methods absent (no key at all) when the adapter lacks them; verbatim forwarding and untouched results; generation read on each invocation (1→5→8 across a read and a write); a consumed 401 on the write still rejects with the adapter called once. FE-805 authored cases now 35, none executed; no runtime PASS is claimed.

## Limitations

- No lint, typecheck, unit test, build or visual check has been executed by Fable; Soren owns execution and Tessa owns visual evidence.
- R2 superseded the placeholder note: the owners' exact commits are merged and wired; their gateways remain unconnected pending the reconciliation above.
- The drawer label still says "Mailboxes" although it now also contains Outreach; renaming requires a coordinated change to the QA-owned e2e spec.
- `elevateo-logo.png` is shipped but unused in the shell; sign-in/auth brand placement belongs to a later scoped request.
- No independent review has been performed on this candidate; see `code-reviews.md` for the self-inspection record only. Root's bounded review is underway; concrete defects will be fixed in this branch as they arrive.
- No fleet screenshots have been supplied yet, so no visual correction has been possible and no visual state is claimed.
- Server files cherry-picked from Cassian's chain (routes, V2 registry, its test) are present only to carry his web adapter; they are not integration-ready on this branch.
