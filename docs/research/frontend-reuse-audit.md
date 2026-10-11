# FE-01 first-party reuse packet

Research only, 2026-10-12. Inspected Git objects from `Elevateo Mail - Integration` at commit `4322cfbb639a383c4e8d940f2dbb019a9832e977`; no source edits, installs, builds, runtime tests, or visual validation. This is a selection packet, not acceptance evidence. Source is the user's first-party repository; dependency licenses still need inclusion in the eventual notice inventory.

<!-- AIDEV-NOTE: Blob IDs identify the inspected source; reuse decisions must follow current product contracts. -->

## Exact extraction candidates

All paths below are relative to the source repository. Blob IDs are Git SHA-1 object identifiers, not downloaded-package checksums. Extract individual files with `git show <commit>:<path>`; do not copy the old application wholesale.

| Source | Blob | Decision |
|---|---|---|
| `src/styles/index.css` | `98806313f6ce2b6a5ebb0aabbcb82159e58c1b91` | Preserve Ledger white/dark-grey/gold tokens, compact row spacing, focus outline and reduced-motion behavior; reconcile runtime coupling to `app/appearance.ts` and `domain/appearance`. There are no separate `tokens.css`/`global.css` files at this revision. |
| `src/app/Sidebar.tsx` | `069b198eddb54e230c1f423550082cbc5252fbff` | Extract the exported `SidebarFrame` and active-segment navigation presentation. It is a symbol here, not a separate file. Remove demo wrapper imports from `data/store` and `composerStore`, campaign navigation and mock unread-count calculation. |
| `src/ui/Button.tsx` | `4df92f86faab4269bb8ca3746612b0c8cc810510` | Candidate button/icon-button primitives. |
| `src/ui/Field.tsx` | `4a85c1cb4fd2dcbf445278cd4746fae92a125b84` | Candidate form primitives; recheck error/label semantics in actual UI. |
| `src/ui/Modal.tsx` | `edd11d0a4080aa948ea560911d5655053619e54b` | Radix dialog, labelled title, optional description and left/right sheets; preserve focus handling and verify keyboard behavior. |
| `src/ui/Badge.tsx` | `b5db5ac6904ed6ff6dbe8b2d2618233cb6995788` | Candidate status presentation. |
| `src/ui/Async.tsx` | `bbea5da40a090ef6b75c6023a98d2213aa1235be` | Candidate loading/error presentation. |
| `src/ui/Bits.tsx` | `538cff0141cf69e10038b9e6adef41e0658af0b0` | Select PageHeader/EmptyState/Skeleton/Pagination/Callout. Remove hardcoded brand/domain assumptions and simulated unsubscribe action. |
| `src/ui/confirm.tsx` | `140bdd743bdea4971e7d968a90df21ae13ca8856` | Candidate confirmation presentation, never substitute for server approval enforcement. |
| `src/ui/toast.tsx` | `12c4c180722a7992905f2d7bfde5910a7ec57328` | Candidate feedback presentation. |
| `src/lib/format.ts` | `00b61a9a87c5dc9ed0cd102b403e2894e00d8e16` | Shared primitive dependency; select only needed formatting/class helpers. |
| `src/features/live/LiveShell.tsx` | `2633baf790a96ff23c1525dbe7a15bae2fde50ce` | Responsive shell, drawer, skip link and main region are candidates; replace old session/capability/navigation contract. |
| `src/features/live/LiveInboxPage.tsx` | `54b1284bc9283763ed7d2d2bc73168c6ed0ff21d` | Reuse URL mailbox/message selection, paged summary/detail separation and lazy body/loading/error presentation. Replace old Gmail/history wiring and permission assumptions. |
| `src/features/live/paging.ts` | `d9f48e469a994a5b00168a8c7bb88e8058572add` | Candidate cursor-navigation behavior; validate cursor scoping to current tenant, mailbox and filters. |
| `src/features/live/ComposePage.tsx` | `412e0eb7c6911a2a7b371665667dd15b9307150e` | Presentation/reference only: old transient draft/reviewed-send lifecycle is not the new durable draft contract. |
| `src/features/compose/RecipientInput.tsx` | `0c3e892d7f19a5a159923a9509c4eef34b63c000` | Candidate recipient interaction; enforce new shared address validation and explicit recipient limits. |
| `src/features/live/SendPreview.tsx` | `5f6835c62c2b57c6566705b8ae75ee7cbeb66ce9` | Candidate immutable review presentation; bind to full server approval envelope and revision. |
| `src/data/http/httpClient.ts` | `8f8e6e08c5160f951d2b91b3c79e6583ccef70d1` | Adapt transport safeguards below. |
| `src/data/http/contract.ts` | `3a727b930dc646e8bc7d0f1bb1e3478d8326aa32` | Old Zod schemas are boundary-validation examples; replace with agreed Rails contract. |
| `src/data/ports.ts` | `5093375cea7c20cee6bbe59f0ec6c077c9d0f9af` | Preserve gateway boundary principle, not old campaign/domain shapes. |

## Required adaptations and exclusions

- Mock mail views are visual references only: `src/features/mail/MailPage.tsx` (`7442c7238155197fc916dbde29b8c275cd92adb8`), `MailRows.tsx` (`312822464d5f37f9dc31b5409640ef4ba1a48d8a`), `MailRail.tsx` (`b6e2c9cd041272026a3bb7c3c3139afca9094f27`) and `ThreadView.tsx` (`d6ae491ab0e598640557aba2675e5473b56bf3bf`) depend on old campaign/domain/identity state. Do not import `src/data/store.ts` (`006d34c610fe7398c6e25fdb92427e1aad1f041a`) or `src/features/compose/composerStore.ts` (`100dd40b933092f743af45a78e219574af3ef7eb`) as production persistence.
- ThreadView marks messages read through mock state and assumes a last message exists. Its attachment download is unavailable/simulated. New empty-thread, real download authorization, stale detail and mailbox-switch behavior require explicit handling.
- Actual live reader renders escaped plaintext in `<pre>`. `src/domain/richText.ts` (`b673f4b809b56205966aa1c88ba977ad46835bc7`) parses a tiny Markdown subset into React nodes; it is not a MIME parser, HTML sanitizer or sandbox. No inspected reader supplies a safe HTML-mail renderer. Keep plaintext until a separately reviewed HTML policy exists; do not invent a completed HTML feature.
- Live Compose has local component form state and explicitly loses drafts on navigation. It splits recipients, bounds each recipient field to 30, body to 100,000 and subject to 998 characters, and creates immutable send requests for separate approval. These are legacy limits, not automatically accepted product requirements. Implement server-persisted optimistic draft revisions, attachment ownership and single-use approval consumption against the new specification.
- `connected && sendEnabled` and Gmail-specific complete-body reply eligibility are old capability assumptions. The server must enforce tenant membership, mailbox grants, sender identity and approval actor permissions on every request; UI flags only explain availability. Replace account-only cache keys and old replacement-send/revision flows with the agreed tenant/mailbox/draft/approval contract.
- httpClient provides credentials=same-origin, no-store, a 10-second AbortController timeout, 262,144-byte streamed response bound, Zod result/error parsing, identity refresh generations and stale-account rejection. Preserve those ideas with endpoint-specific size budgets. Its `x-elevateo-csrf: 1` is a custom marker, not a secret token; Rails must explicitly enforce its chosen CSRF/origin/session policy. Its `x-elevateo-account` does not establish authorization. Preserve uncertain-result handling for network/timeout/5xx writes: fetch status/idempotency outcome rather than blindly retry a send.

## Actual source dependency lock

`package.json` blob `f8849fcd8089a51f530e63effdb3dc41ef35205b` contains ranges; authoritative inspected lock is `package-lock.json` blob `e66d07c5c4d4ddeb0d270829b673f794b91822ea`. These are source selections, not independently reproduced installations. Preserve the lock and its per-package integrity values when extracting; review changes through a new lock diff.

| Package | Exact locked version |
|---|---|
| react / react-dom | 19.3.0 / 19.3.0 |
| react-router | 7.18.4 |
| vite / vitest | 7.3.6 / 3.2.7 |
| zod / zustand | 4.6.5 / 5.0.15 |
| typescript | 5.9.3 |
| @radix-ui/react-dialog / @radix-ui/react-alert-dialog | 1.1.23 / 1.1.23 |
| @playwright/test | 1.56.1 |
| @tauri-apps/cli | 2.12.1 (do not copy into FE-01 unless desktop scope needs it) |

Example lock integrity evidence: React `sha512-E8LUcbtBWt20bbl2YoHfx4ZDBdxVTfOKtCZn9cDSJ4l6/nuoApcpIBcj47t2wZoVX8g2ZHuMHbiShgCR1T5Sog==`; router `sha512-PUPQcMhMGRAslLcvtlPz/kmzBEWPhLdgLFrL7pLNepBL6dX0lWj4WD2cUYVgYCuT3jxvghYFg81cDTj44DhetQ==`.

Current primary-source spot checks: [Vite guide](https://vite.dev/guide/) specifies Node 20.19+ or 22.12+; select and pin a supported runtime satisfying that floor. [React Router GHSA-337j-9hxr-rhxg](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg) affects versions below 7.18.0 for particular SSR hydration use, and [GHSA-2j2x-hqr9-3h42](https://github.com/remix-run/react-router/security/advisories/GHSA-2j2x-hqr9-3h42) affects 7.x below 7.14.1. Locked 7.18.4 is outside both stated ranges. This is not a complete advisory audit or a claim that all dependencies are secure; perform lock-based advisory/license review before implementation acceptance, including transitive and development dependencies.

## FE-01 implementation evidence still required

Fable owns frontend work. Start from the selected presentation files and an explicit mock gateway using the new schema; every simulated action remains labelled. Validate actual application light/dark and narrow/wide layouts, keyboard dialog/navigation behavior, empty/loading/error/permission states, route reload/back navigation, stale mailbox responses, durable draft conflict recovery and uncertain send outcome handling. Run the required containerized lint/type/unit/integration checks plus browser/visual QA and adversarial review after implementation. None ran during this research task.
