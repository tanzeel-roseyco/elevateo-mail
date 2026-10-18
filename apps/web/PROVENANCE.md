# apps/web reuse provenance — FE-01 read checkpoint

Source: user's first-party Ledger frontend, commit `4322cfbb639a383c4e8d940f2dbb019a9832e977`,
supplied as the coordinator's read-only export (`ElevateoCoordinator/fe01-source-4322cfb`). Blob
IDs are from docs/research/frontend-reuse-audit.md. First-party code; no third-party notices were
attached to these files in the export. Declared dependency licenses are inventoried separately in
`docs/evidence/fe-01-r1-data/lock-license-inventory.json`; vulnerability audit results do not establish license review.

| Destination | Source path (blob) | Modifications |
|---|---|---|
| `src/styles/index.css` | `src/styles/index.css` (`98806313`) | Removed runtime appearance coupling (`--chrome-opacity`, `--bg-blur`, `.chrome`, `.figure`); added `prefers-color-scheme` fallback since no Settings surface sets `data-theme` yet. Tokens, focus outline and reduced-motion kept. |
| `src/ui/Button.tsx` | `src/ui/Button.tsx` (`4df92f86`) | Unchanged in substance. |
| `src/ui/Badge.tsx` | `src/ui/Badge.tsx` (`b5db5ac6`) | Dropped lucide icons and campaign/contact/delivery StatusBadge map. |
| `src/ui/Async.tsx` | `src/ui/Async.tsx` (`bbea5da4`) + `src/ui/Bits.tsx` (`538cff01`) | Kept LoadGate/Skeleton/EmptyState shapes; dropped useLoad/useOnline/OfflineBanner, pagination, callout and the simulated unsubscribe action; icons replaced. |
| `src/app/Sidebar.tsx` | `SidebarFrame` in `src/app/Sidebar.tsx` (`069b198e`) | Navigation reworked to the current mailbox list; removed `data/store`/`composerStore` imports, mock unread counts, Compose action and `logo.png` (asset rights unverified). Active-item presentation and footnote idea kept. |
| `src/lib/format.ts` | `src/lib/format.ts` (`00b61a9a`) | Kept `cx`/`formatWhen`/`formatDateTime` with invalid-date placeholders; dropped unused helpers and timezone cache. |
| `src/data/http/transport.ts` | behavior of `src/data/http/httpClient.ts` (`8f8e6e08`) | Reimplemented: same-origin credentials, no-store, 10 s abort deadline, streamed byte bound, Zod parsing kept; added per-endpoint budgets, redirect rejection, content-type check; removed `x-elevateo-csrf: 1` marker and `x-elevateo-account` header per FE-D03. |
| `src/features/inbox/InboxPage.tsx`, `src/app/Shell.tsx` | `LiveInboxPage.tsx` (`54b1284b`), `LiveShell.tsx` (`2633baf7`) | Presentation/behavior reference only (URL selection, paged list/detail split, drawer/skip link); code rewritten against the FE-01 contract. |

Not copied (per dispatch): mock stores, campaign features, legacy DTOs/account headers, old auth
markers, `richText.ts`, composer/send lifecycle, Zustand, Tauri tooling, lucide-react.
First-party new files: `src/ui/icons.tsx`, `src/app/scope.ts`, `src/app/session.tsx`,
`src/data/*` (except transport behavior noted above), `src/features/thread/ThreadPage.tsx`,
entries, configs and tests.

## FE-01-R1 data repair

Astra LOW updated transport lifecycle cleanup, strict JSON media-type handling and operation-specific fixture validation under the accepted repair dispatch. Coordinator added pinned Node declarations/lint tooling and shared test cleanup wiring. Source/test hashes and Docker evidence are in `docs/evidence/fe-01-r1-data`. This changes the adapted behavior described above without changing its first-party provenance.

## 2026-10-18 design refresh

First-party. `src/app/HomePage.tsx`, `src/app/RouteContext.tsx`, `src/app/pageMeta.ts` and the new icons in
`src/ui/icons.tsx` are original. Design references in `docs/design/ux-audit-20261018.md` section 6
(design-taste, better-design, superdesign, canvas-ui, paper-design/shaders, uilayouts, motion-primitives,
cursify) were reviewed as guidance only: no code, assets or dependencies were copied or added.
