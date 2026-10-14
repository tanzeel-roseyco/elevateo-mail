# Mira FE-806 candidate

Baseline: `bbf2353b254a05d48c2da7a508c143e6fba78691`. Scope owned: `apps/web/src/features/inbox/InboxPage.tsx` and its component tests. The existing `ThreadPage`, `DraftEditorPage`, BE03 review/status components and gateway already implement plaintext read, reply-as-draft, operation-bound save and simulated approval/status; this change adds an inbox entry to that journey. It creates no draft or send by navigating.

Source references: `apps/web/src/app/mailboxes.tsx` supplies the current capability snapshot; `apps/web/src/features/drafts/DraftsPage.tsx` owns new draft identity; `apps/web/src/app/App.tsx` owns routes; `apps/web/src/data/gateway.ts` owns the existing HTTP boundary. No dependency was added and no gateway/contract/shell change is required for this slice. The compose link appears only on a successful inbox read and a known true compose flag, preventing a stale capability hint from remaining actionable after a denied read. Subsequent server checks remain authoritative.

Authored cases: successful link with no save call, capability denial, and read denial despite a stale capability hint. Requested fleet Docker execution: `cd apps/web && npm run typecheck && npm run lint && npm run test -- src/features/inbox/InboxPage.test.tsx && npm run build` under Soren's QA815 lock. Executed: none; no host app test/build was run. Integrated real HTTP, visual, and send outcomes remain unverified.

Design simulation for root: if capability is known true then mailbox read returns 404, the link stays hidden; a direct URL may still open drafts but server authorization must reject writes. Keeping this entry on a known true hint trades temporary hiding during mailbox-list load for a clear denied state; no new backend permission model is introduced.

Candidate commit SHA: pending commit at this record's creation; see outbox for final SHA. Independent adversarial and design tradeoff reviews are requested, not claimed.
