# Independent current-source visual QA — 2026-10-24

Status: QA COMPLETED; strict visual parity FAIL; console gate FAIL. No UI implementation changes.

<!-- AIDEV-NOTE: Evidence belongs to the exact staged manifest, not historical r4 captures or later UI changes. -->

## Provenance

Task task_6530edcdb1b1, active dispatch ctx_4824574b268d; supersedes the earlier preparation-only NOT_RUN record. Read README/state/documentation/STANDARDS and handoff AGENT-BRIEF/DESIGN-SPEC/INBOX-SPEC. Fable retains UI ownership. All 263 allowlisted source hashes verified on fleet and still match the current local tree after capture; zero mismatches. No secrets staged.

SHA-256 values:
- Source archive: a245234ad7582207f43171972d88f0fe2d2bb63793b39861dc2bd1b4dd1ccf86
- Reference archive: ed4f7f6b4548746adf36301bb875e17ba5aa341addef4a5f54d6f935b1ea3eb3
- Source manifest: 48edfeca88fbbb31a8087a576f814c9109d4a647a9af3e718b296d868d853dfd
- Capture script: 946fe819d4b2f48b420c96d536a2e72892e363f87dec44bbfee6431da89ceaf5
- Retry runner: d39c586998b8a2b1b18d1975116185ce376ffeeeaf69ac6bee5d5d610b09c71d

Fleet stage: /home/tanzeel/em-work/independent-visual-20261023-505bb16b
Fleet evidence: /home/tanzeel/em-evidence/independent-visual-20261023-505bb16b
Local preparation/evidence: C:/Users/Tanzeel/Code and projects/elevateo-independent-visual-qa-20261023

## Execution and results

Coordinator explicitly authorized the slot after unified gate, then authorized fleet-only npm ci rebuild when the old dependency image was absent. Whole run held common flock. Disposable built image sha256:e9d04aa7420fdc0464c16f0bcf77baa458ce1ea4a57596ad6ee81ee6553d6f30; existing pinned browser sha256:35246d87a7c88ea9b771c65d33171b2611b02a8253b4b12ce6f94376c55f99f2. Vite fixture build/preview ran in Docker; no laptop tests.

Captured 86 route states at 1440x1000 and 390x844: 172 fresh app PNGs plus 20 offline reference PNGs. All 192 visually inspected through 16 labeled contact sheets; mobile profile pair additionally inspected full size. Coverage includes dashboard, unified/mailbox/folders/thread/drafts/compose/search, members, inventoried settings, outreach fallback/templates, help/search/community, ten collections, 28 articles and auth pages. No old r4 captures reused.

| Check | Result |
| --- | --- |
| Capture completion | 172/172 app, 20/20 reference |
| Document horizontal overflow | 0/172 |
| Readiness/console | 166 clear, six captures with 404 errors |
| Heading x/height/font | All 20 pairs: dx=0, dh=0, 18px |
| Desktop sidebar width | All ten pairs: delta=0 |
| Strict 1–2px parity | FAIL |

Evidence files: captures/*.png, captures/geometry.json, capture.log, build.log, dependency-build.log, verification.json, captures.tgz and cleanup receipts. Local contact sheets: captures/sheets/sheet-00.png through sheet-15.png.

## Findings for Fable

Intended logo/gold changes excluded. These are grouped visual findings, not a source-code review; KLOC defect density is inapplicable.

1. Offline-state parity blocker: all ten desktop pairs have heading y +33.8px; mobile pairs +48.7–54.7px. Docker network-none triggers ConnectivityBanner, absent in reference. Files: src/app/Shell.tsx, src/ui/ConnectivityBanner.tsx. Evidence: dashboard/settings app and REF pairs, geometry.json. This measures offline layout, not proof of wrong online baseline geometry. Capture online state separately without weakening truthful offline warnings.
2. Mobile card geometry differs independently of that offset: profile/workspace cards are full-width one-column while reference uses two columns at390px. Files: src/ui/Card.tsx:74 (grid-cols-1, sm:grid-cols-2), src/features/settings/ProfilePages.tsx and WorkspacePages.tsx. Evidence: settings-profile-390.png vs settings-profile-REF-390.png and corresponding workspace pair. Resolve fidelity versus responsive readability explicitly.
3. Fixture/simulation overlays overlap each other and obscure text/forms/FAB area at the captured viewport. Files: src/dev/fixtureMain.tsx:34 (fixed fixture pill) and src/app/Shell.tsx:303 (fixed simulation strip; shared-inset AIDEV-TODO at298–301). Evidence: help-articles-api-tokens-390.png, help-collections-inbox-390.png, mailbox-members-390.png, compose-390.png and thread-390.png. Fixture pill is development-only; simulation strip is conditional app UI. Full-page screenshots place viewport-fixed strips mid-document; zero document overflow does not establish scroll accessibility.
4. Substantial content departures: dashboard mailbox/conversation/campaign sections replace reference blacklist/DMARC sections; mobile summary is two columns instead of five. Developer API/MCP/password/tags/webhooks show alternative or unavailable content instead of reference controls; integrations adds CLI. Files: src/app/DashboardPage.tsx:333 (responsive summary grid) and src/features/settings/{DeveloperApiPage,IntegrationsPages,ProfilePages,TagsPage,WebhooksPages}. Evidence: corresponding app/REF pairs both widths. Backend limits may justify unavailable UI; do not fabricate working controls for fidelity. Coordinator must accept scope departures or route repairs to Fable.
5. Console gate failure: people and settings-members each emit two404 messages per viewport; settings-personal-details emits one per viewport (ten messages in six captures). People/members display failed current-grants loading; personal details displays failed settings loading. Files: src/features/members/AdministrationPage.tsx and src/features/settings/ProfilePages.tsx with fixture/API adapters as follow-up. Evidence: six named route PNGs and geometry.json errors. Logger does not retain resource URLs; exact endpoints/cause unproven. Do not infer production backend failure from this fixture run.

No observed shipped EmailGuard logo/name in app screenshots; references retain original branding intentionally.

## Limits and next work

Visual acceptance withheld. Route rendering and fallback/error evidence do not prove backend alignment, authenticated lifecycle, live integrations, sending, mobile keyboard, click interactions or every scroll position. Unavailable outreach/review/send pages are not happy-path evidence. References are static offline renders. No production/provider/DNS/mail changes. Fable owns repairs; next capture should distinguish online baseline geometry from offline-state UI. No substitute implementation model or credits used.

## Cleanup

Exact task preview/browser containers removed; cleanup-containers.txt empty. Disposable QA image removed, dedicated buildx builder/cache removed, copied runtime dependencies removed (176611553 bytes). Source/evidence retained. Existing browser, unrelated workloads/images/volumes and persistent data retained; no broad prune. Docker usage returned to pre-run totals: images103.9GB, containers4.886GB, volumes16.81GB, cache4.62MB. Host available space rounded67GB before/after; exact physical reclaimed bytes cannot be inferred. No laptop Docker ran; Windows Docker compaction inapplicable. Disposable dependency image would require rebuilding next time.
