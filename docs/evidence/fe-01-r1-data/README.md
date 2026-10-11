# FE-01-R1 stage A evidence

### FE-01-R1 data checkpoint (2026-10-12)

Bounded Astra LOW data repair is ready for the serialized Fable UI handoff, not overall acceptance. Pinned Docker Node 24.21.0/npm 11.19.0 passes strict types, 113 data tests, then API regeneration, all 123 unit tests with coverage and production build. Bundle inspection found none of three fixture markers; browser runtime isolation remains open. Lint fails only on the existing unused session-test waitFor import, owned by the forthcoming Fable repair. Historical broken transport baseline: 10/21 failures. Additional cancellation baseline: 2/7 failures; repaired all seven pass. The first regeneration failure was working-tree CRLF conversion; restoring canonical Git bytes recovered the exact frozen schema and generated hashes without contract changes.

Logs and source hashes: docs/evidence/fe-01-r1-data. npm audited 325 packages with zero reported vulnerabilities. Full suite coverage: statements83.28%, branches68.54%, functions81.81%, lines89.09%; no coverage-completeness claim. No UI/browser, real Rails or publication acceptance. Disposable containers auto-removed; task Node image removed; zero containers/cache. Pre-existing Playwright/Python images and nine persistent volumes retained. Host free space1,030,987,776bytes; no VHD compaction/reclaimed-host-byte claim.

The mounted-script commands ran against read-only source with tmpfs workspaces. The earlier diagnostic data-check wrapper returned a misleading process exit after shell quoting loss; it is not acceptance evidence. The named pinned-check and suite-check transcripts record reliable individual exits. The full Docker target remains failing at lint until Fable repairs its assigned session tests.
