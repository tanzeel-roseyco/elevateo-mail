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

## Limitations

- No lint, typecheck, unit test, build or visual check has been executed by Fable; Soren owns execution and Tessa owns visual evidence.
- R2 superseded the placeholder note: the owners' exact commits are merged and wired; their gateways remain unconnected pending the reconciliation above.
- The drawer label still says "Mailboxes" although it now also contains Outreach; renaming requires a coordinated change to the QA-owned e2e spec.
- `elevateo-logo.png` is shipped but unused in the shell; sign-in/auth brand placement belongs to a later scoped request.
- No independent review has been performed on this candidate; see `code-reviews.md` for the self-inspection record only. Root's bounded review is underway; concrete defects will be fixed in this branch as they arrive.
- No fleet screenshots have been supplied yet, so no visual correction has been possible and no visual state is claimed.
