# Mira FE-806 candidate

Baseline: `bbf2353b254a05d48c2da7a508c143e6fba78691`. Scope owned: `apps/web/src/features/inbox/InboxPage.tsx` and its component tests. The existing `ThreadPage`, `DraftEditorPage`, BE03 review/status components and gateway already implement plaintext read, reply-as-draft, operation-bound save and simulated approval/status; this change adds an inbox entry to that journey. It creates no draft or send by navigating.

Source references: `apps/web/src/app/mailboxes.tsx` supplies the current capability snapshot; `apps/web/src/features/drafts/DraftsPage.tsx` owns new draft identity; `apps/web/src/app/App.tsx` owns routes; `apps/web/src/data/gateway.ts` owns the existing HTTP boundary. No dependency was added and no gateway/contract/shell change is required for this slice. The compose link appears only on a successful inbox read and a known true compose flag, preventing a stale capability hint from remaining actionable after a denied read. Subsequent server checks remain authoritative.

Authored cases: successful link with no save call, capability denial, and read denial despite a stale capability hint. Requested fleet Docker execution: `cd apps/web && npm run typecheck && npm run lint && npm run test -- src/features/inbox/InboxPage.test.tsx && npm run build` under Soren's QA815 lock. Executed: none; no host app test/build was run. Integrated real HTTP, visual, and send outcomes remain unverified.

Design simulation for root: if capability is known true then mailbox read returns 404, the link stays hidden; a direct URL may still open drafts but server authorization must reject writes. Keeping this entry on a known true hint trades temporary hiding during mailbox-list load for a clear denied state; no new backend permission model is introduced.

Candidate commit SHA: pending commit at this record's creation; see outbox for final SHA. Independent adversarial and design tradeoff reviews are requested, not claimed.

## Message-level reply continuation

Source: `apps/web/src/features/thread/ThreadPage.tsx` and its tests. The earlier thread-level reply link only carried a thread ID; a person had to manually reconstruct a recipient and subject. The new message action seeds an owner-keyed `DraftIntent` with the exact selected sender address, editable subject, and thread binding, then enters the existing draft editor. This is memory-only and does not put recipient/subject in the URL or make a write. Unknown sender, denied compose capability, and truncated subject have explicit behavior. Existing gateway, contract, draft operation and shell routes remain unchanged.

Authored cases: selected sender and subject prefill with no save before user action then one explicit save; missing sender address; denied compose; shortened subject. Requested Soren Docker command on candidate SHA: `cd apps/web && npm run typecheck && npm run lint && npm run test -- src/features/thread/ThreadPage.test.tsx src/features/thread/CollaborationPanels.test.tsx src/features/drafts/DraftEditorPage.test.tsx && npm run build`. Executed by Mira: none. Real HTTP/browser, stale session, uncertain save and review/status outcomes still need integrated evidence; existing draft/send tests are historical baseline evidence only.

Design simulation for root: a malicious or truncated subject never becomes an implicit authorization or HTML surface; React inputs treat it as text, and a shortened subject is left for the writer. A revocation between reader and draft open cannot authorize a save because the draft editor must read under current context and the backend rechecks the mutation. Memory-only prefill avoids URL leakage but is lost on full reload before save; the editor presents its existing unload guard for unsaved intent.
