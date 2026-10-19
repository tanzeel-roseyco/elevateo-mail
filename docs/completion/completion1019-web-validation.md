# Newest web validation — 2026-10-19

Candidate: `5c39dc9e` (`feature/resend-transport`), archived without modifying the source. Docker-only validation ran on fleet-02 under the shared soren lock. This verifies the current web build and browser fixtures; it is not production deployment or real-provider delivery proof.

- API v1/v2 generation and checked-in contract checks, lint, typecheck, production build: passed.
- Vitest: **913 tests / 69 files passed**. Coverage: statements 89.21%, branches 82.79%, functions 87.66%, lines 94.24%.
- Pilot browser: **28/28 passed** across Chromium, Firefox, WebKit, and narrow390.
- Manual visual inspection: eight retained desktop/narrow screenshots cover attachment review, delivery status, consent blocking, and bounce suppression. Text and controls remain readable and aligned without horizontal overflow. Hostile fixture text remains literal. Delivered status explicitly does not claim that email was read. Consent and suppression explanations are visible.
- The attachment-review fixture uses the held outbound route; its screenshot does not demonstrate Resend activation. The consent-blocked fixture explicitly uses Resend.

Evidence: [web log](qa815-evidence/completion1019-web/completion1019-web-r1.log), [browser log](qa815-evidence/completion1019-web/completion1019-pilot-browser-r1.log), and eight PNGs in the same directory.

Cleanup: web log records `checks_exit=0`, `cleanup_failed=0`; browser records `checks_exit=0`, `context_absent=yes`. Task-owned test container, build image, BuildKit builder/cache volume, and extracted contexts were removed. The pre-existing pinned Playwright image was retained. No persistent data was deleted. Exact reclaimed bytes were not measured; this Linux fleet run requires no Windows Docker-disk compaction.

The build emits the existing Vite warning for the approximately 504 kB application chunk. It does not fail the build. No code review wave or application source change was needed for this validation.
