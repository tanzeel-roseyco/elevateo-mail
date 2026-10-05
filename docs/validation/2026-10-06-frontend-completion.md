# Frontend completion evidence — 6 October 2026

Credential-free checks on the integration worktree. No provider credentials, external sends, DNS changes, deployment or push.

## Web checks

Final Docker whole-project lint, TypeScript, 52 test files / 485 tests, and production build passed. Evidence: `output/takeover/complete-web-final.log`. The disposable image contained a generated tauri-validation/dist directory; only that generated directory was removed inside the test container before whole-project lint. No permanent ignore was added. This includes selected-message AI draft review and expiring native ticket transfer, Gmail reply identity preservation, saved campaign sequences, bounded search, operational health and optional Hunter controls.

Hunter requires a stored owned contact and explicit acknowledgement before each potentially billed lookup. Keys use a password field and are cleared immediately; there is no automatic lookup or retry. Enrichment never grants consent or personalises a message itself. AMF remains unavailable pending an identified contract. Disabled or broken Hunter configuration leaves stored access revocable; expired sessions clear private controls.

## Review

Hunter gateway/component: 122 source lines reviewed independently by the backend agent; one P2 defect (8.20 per 1,000 lines): status failure hid otherwise independent revocation. Fixed with nested status error handling and a regression. Independent rereview found no further defect. The parent Connections test now mocks Hunter consistently with its other independently tested provider panels.

## Browser and visual checks

Final API browser run: 39/40 passed. The sole failure was an obsolete enrichment-placeholder assertion, now replaced by the dedicated Hunter-disabled regression. After correcting that assertion, the affected provider-gates journey passed 1/1. Evidence: `output/takeover/hunter-browser-validation.log` and `hunter-browser-gates-recheck.log`. The manual Docker preview was rebuilt from current frontend/backend and its two disposable containers restarted. Earlier preview web had no source mounts and was stale; earlier manual observations cannot establish acceptance of later screens. Twenty current Docker-preview frames were captured and manually inspected: Search, Hunter, sequence editor, unsupported reply source and Assistant at desktop/mobile in light/dark themes. Mobile sequence button clipping was fixed and both final mobile frames inspected; browser bounding-box and Assistant-title checks passed. Screenshots: output/takeover/visual-final/. The updated mobile sequence product journey also passed 1/1 (mobile-sequence-final.log). Coordinator additionally inspected Inbox, Overview and Connections/Sending.

## Limits

These checks use real local HTTP/D1 and synthetic provider fixtures. They do not demonstrate Gmail/Hunter/Resend credentials, installed native CLI execution, production latency, or a hosting cost target. Real sequence activation defaults off. A guarded Resend-only deployment capability is supported; the UI accepts its boolean status without granting approval. Gmail remains manual-only. Each supported send still requires individual approval.


## Bounded pilot measurement

`backend/local/pilotLoad.ts` uses an isolated disposable fake-provider D1 fixture: 10 owners, 100 mailboxes and 10,000 messages. At concurrency 20, 3,100 single-recipient approvals admitted exactly 3,000 and refused 100; every mailbox held 30 reservations and one unapproved draft. One hundred paged inbox reads also verified foreign-owner detail access returns 404. No provider dispatch occurred.

Wall time: 108.32 seconds. p95 creation 554.48 ms; approval 333.26 ms; read operation 268.34 ms (each includes the foreign-owner check). Node peak RSS 641,077,248 bytes; Docker memory snapshots reached 1.211 GiB, not a measured peak. Docker includes workerd and other container processes. These are direct local handler/D1 measurements on a shared remote host, not production network latency, Cloudflare CPU billing, cloud capacity, or a cost guarantee. Evidence: `output/takeover/pilot-load.log`.

Independent review covered 83 lines with zero defects (density 0/1,000). Docker TypeScript passed including the measurement script and the integration harness. The harness now checks the runtime scheduled entrypoint explicitly because Miniflare's generated Fetcher type omits it. Disposable measurement/typecheck containers used `--rm` and exited; task preview services remain for the coordinator's visual QA.
