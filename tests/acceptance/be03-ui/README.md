# BE03 UI browser evidence harness

This scoped harness runs the actual candidate React routes with a explicitly labelled in-memory gateway. It proves client rendering and interaction only. It does not establish SQL persistence, real HTTP approval, worker execution, provider acceptance or delivery.

`runtime.sh` runs inside the retained fleet Node dependency image with immutable candidate `/source`, this immutable harness `/harness`, and private evidence `/output`. It compares the package lock, copies only into ephemeral `/tmp/check`, checks TypeScript/lint, then serves localhost18142. No dependency install, pull or image build is needed. Production entries and existing previews18140/18141 remain untouched. Browser screenshots use desktop1280x900 and mobile375x812, including both top and scrolled approval controls at their original viewport sizes. Long arbitrary content may require further manual captures.

The Playwright config uses a separate bounded browser container and an explicitly supplied existing Chromium executable. One worker, zero retries; traces off; payloads are synthetic public example.test content. Runtime invocation, exact candidate/harness identities and immediate exact container cleanup must be recorded by Mira. Soren retains the heavy DB lease. Root alone owns visual acceptance.

Cases: save-current-text -> full literal review -> attest -> queue; timeout -> original binding retry -> queue; nonready empty; unavailable review; stale review. Loading, plaintext, focus, approval gating and horizontal overflow are asserted. The fixture compares the entire retry input and returns a synthetic receipt; it is not a server idempotency oracle.

Runtime currently NOT_RUN; source review receipt is published separately in incoming coordination. BE02 OPEN; no application completion or release claim. Effective Fast billing unverified.
