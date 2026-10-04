# Outreach Mailroom: test and GUI verification strategy (research only)

I didn't change any code or run any builds, tests or external account actions. Every source below was actually fetched. I did not look at the Instantly, Smartlead, Hunter or Google Workspace API docs, so I make no claims about their sandboxes or rate limits.

## Sources read

**arXiv**
- **arXiv:2207.01047**, *An Empirical Study of Flaky Tests in JavaScript* (Hashemi, Tahir, Rasheed; ICSME 2022). https://arxiv.org/abs/2207.01047
- **arXiv:2103.02669**, *An Empirical Analysis of UI-based Flaky Tests* (Romano et al.). https://arxiv.org/abs/2103.02669
- **arXiv:1908.06466**, *Feedback-based, Automated Failure Testing of Microservice-based Applications* (Cui et al.; ASE 2019 LBR). https://arxiv.org/abs/1908.06466
- These came up in search but I only read the search snippet: arXiv:2512.16959 (a systematic review of resilience patterns) and arXiv:2101.09077 (flaky tests in Python).

**Primary documentation**
- Docker Desktop license: https://docs.docker.com/subscription/desktop-license/
- GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Tauri WebDriver testing: https://v2.tauri.app/develop/tests/webdriver/
- Playwright WebView2: https://playwright.dev/docs/webview2
- Playwright Clock: https://playwright.dev/docs/clock
- Playwright accessibility testing: https://playwright.dev/docs/accessibility-testing
- fast-check race conditions: https://fast-check.dev/docs/advanced/race-conditions/
- PostgreSQL continuous archiving / PITR: https://www.postgresql.org/docs/current/continuous-archiving.html
- k6 docs: https://grafana.com/docs/k6/latest/
- Podman Desktop: https://podman-desktop.io/

**Access gaps:** I fetched no pages that failed. The k6 page didn't state the exact license, so the license name is **unverified**. Check the LICENSE file in the repository.

## What the sources actually say

| Topic | What the source says |
|---|---|
| Flakiness in JavaScript | "flakiness caused by concurrency-related issues (e.g., async wait, race conditions or deadlocks) is the most dominant reason." OS-specific behaviour and network stability also contribute. Over 80% of flaky tests get fixed; a minority are skipped, quarantined or removed. (2207.01047, 452 commits) |
| Flakiness in UI tests | Based on 235 samples from 62 web and Android projects. Root causes include asynchronous waits and the test environment. (2103.02669) |
| Fault injection | IntelliFT automatically injects faults to "expose the defects in the fault-handling logic quickly". The authors call it effective, but the evidence is one initial experiment on a medium-sized benchmark. (1908.06466) |
| Docker Desktop | Free for personal use, education, non-commercial open source, and companies with **fewer than 250 employees and less than $10M annual revenue**. Everyone else needs a paid plan. |
| Podman Desktop | Describes itself as free and open source and supports Windows. Red Hat sells optional enterprise support. |
| GitHub Actions (private repos, Free plan) | **2,000 min/month**, 500 MB artifact storage, 10 GB cache per repo. Windows costs $0.010/min versus $0.006/min for Linux, so Windows minutes run out faster. Standard runners are free for public repos. Going over the quota requires a payment method. |
| Tauri GUI testing | `tauri-driver` supports **Windows and Linux only** (macOS has no WKWebView driver). The WebdriverIO `@wdio/tauri-service` keeps msedgedriver in sync on Windows. The CrabNebula option needs a paid key on macOS. |
| WebView2 through Playwright | You can connect with `connectOverCDP` once the app is started with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`. Parallel runs need a separate user data directory and port per worker. |
| Simulated time | Playwright Clock overrides `Date`, `setTimeout` and `setInterval`. `fastForward` simulates a laptop sleeping and waking; `runFor` ticks through timers one by one; `pauseAt` freezes time. |
| Concurrency | fast-check's `scheduler` changes the order in which promises resolve (`scheduleFunction`, `waitIdle`) and supports model-based runs (`scheduledModelRun`). |
| Accessibility | Playwright says "many accessibility problems can only be discovered through manual testing," and recommends Accessibility Insights for WCAG 2.1 AA. |
| Restores | PostgreSQL says to set up and test WAL archiving *before* the first base backup, and after a recovery to "inspect the contents of the database to ensure you have recovered to the desired state." |
| k6 | Describes itself as an open-source CLI that runs locally and in CI. |

## How I'm applying the papers (my reasoning, not their findings)

- **Ban real sleeps.** Because async waits and races were the top flakiness cause in the JS study, I'd forbid real `sleep` calls and wall-clock time in tests. Inject a clock everywhere: Vitest fake timers, Playwright Clock, and an injectable `Clock` interface in the workers. This is a design choice I'm drawing from the papers, not something they tested.
- **Keep GUI tests few and separate.** Since UI tests are especially sensitive to the environment, I'd keep the GUI suite small and run it separately from the Docker logic suite.
- **Test the failure-handling code on purpose.** IntelliFT's point is that error-handling code needs its own tests. I'd apply that with a cheap, deterministic fault table in the provider simulators (429, 5xx, timeout, malformed JSON, partial batch, duplicate webhook) rather than a chaos platform. Adopting their feedback-driven search would be cargo-culting at this scale.
- **Rank tests by risk.** This is my own heuristic for what the papers imply. The highest-risk failures are irreversible external effects: duplicate sends, sends after an unsubscribe, sends from the wrong mailbox, and an MX change. Those get the most test depth.

## Recommendation

1. **Container runtime.** Use Docker Desktop only if the user fits the free categories. Otherwise use **Podman Desktop**, or Docker Engine inside WSL2 (that option is my suggestion; I didn't verify its license terms here). Keep the compose files compatible with both.
2. **Two test lanes.**
   - **Lane A (Docker or Podman, Linux):** Vitest, Testing Library, ESLint, `tsc`, Playwright against the Vite build in the official Playwright image, simulated providers, Postgres, and the workers.
   - **Lane B (Windows host exception, justified):** WebView2 is a Windows-only component and can't run in a Linux container. Run a small smoke suite through `tauri-driver`/WebdriverIO, or Playwright `connectOverCDP`. CDP is lighter and reuses the existing Playwright tests, so I'd pick it. Treat WebdriverIO as the fallback if CDP has problems with Tauri builds.
3. **Provider simulation.** Write local stub servers for Gmail/Workspace, Instantly, Smartlead, Hunter and the AI CLIs, driven by recorded fictional fixtures. Add contract tests that check the stubs against hand-maintained schemas. Mark the schemas with the date someone last checked them against the vendor docs, because stubs drift.
4. **AI replay.** Record Codex and Claude outputs once by hand, store them as fixtures, and replay them in CI. Check deterministic properties: no invented facts beyond the contact fields, required unsubscribe text present, length limits, and that the Claude fallback triggers when Codex returns an error or times out. Don't use an LLM as a judge in CI because it costs money and gives non-deterministic results.
5. **CI.** Running Lane A locally or on a self-hosted runner costs no CI minutes. If you use GitHub-hosted runners for a private repo, run only lint, typecheck and unit tests on Linux to stay well under 2,000 minutes. Never put Windows GUI jobs on hosted runners.

## Test matrix

| Area | Risk | Tool | When it runs |
|---|---|---|---|
| Idempotent sends, unsubscribe/suppression, mailbox routing | Critical | Vitest + fast-check (properties, scheduler races between two workers) | Every commit |
| Campaign scheduling: time zones, DST, pause/resume, laptop off | Critical | Fake clock plus a worker test with a 30-day `fastForward` | Every commit |
| Provider faults (429/5xx/timeout/duplicate webhook) | High | Stub fault table | Every commit |
| Contract schemas | High | Schema checks on stubs and fixtures | Every PR, plus a monthly manual check against vendor docs |
| UI flows (manual add of mailbox/contact/message) | High | Playwright on Chromium in a container | Every PR |
| Native WebView2 smoke | Medium | CDP or tauri-driver on the Windows host | Before each release |
| Accessibility | Medium | axe in Playwright, plus a manual Accessibility Insights pass | Axe every PR; manual pass per release |
| Security | High | `npm audit`, ESLint security rules, secret scanning, auth/tenant-isolation tests | Every PR |
| Restore drill | High | PITR into a throwaway Postgres container, then row-count and checksum checks | Monthly, and before launch |
| Load | Medium | k6 (license unverified) or Artillery/autocannon against stubs | Before release, and after queue changes |

**What I'd leave out for now:** cross-browser testing beyond Chromium (WebView2 is Chromium-based), a chaos platform, pixel-diff visual regression on every PR, testing against real provider sandboxes in CI, mutation testing, and macOS. Revisit them only when there's a clear trigger.

**Native visual evidence:** at release time, keep WebView2 screenshots and a short screen recording from Lane B, plus the Windows build and WebView2 runtime versions, stored as release artifacts. Remember artifact storage counts against the 500 MB limit if kept on GitHub.

## Limitations and cost caveats

- Mocks and stubs don't prove live delivery, inbox placement, DKIM/SPF/DMARC alignment, provider rate limits, or account-suspension behaviour. Those need a manually approved live test with seeded inboxes you control. Real provider certification is out of scope here.
- "No extra fees" doesn't mean free. Electricity, hardware wear, your time, and any overage on paid CI runners are real costs. A Docker license may be required if the user doesn't qualify for free use.
- A load test against stubs measures your own queue and database, not provider throughput. Since the expected traffic hasn't been quantified, run increasing load steps and find where it breaks rather than guessing a target number.
- The papers are about open-source and benchmark systems. Applying them to this project is my extrapolation.

## Acceptance checks for implementation

- [ ] Every Lane A test runs with a single `compose run` command on Podman and on Docker; no host Node is needed.
- [ ] Zero network egress during tests (stubs only), enforced through network policy or a failing DNS resolver.
- [ ] A lint or test rule rejects real `setTimeout` sleeps and `Date.now()` outside the clock module.
- [ ] Property tests show that with N concurrent workers there are no duplicate sends and nothing goes to suppressed contacts, using at least 1,000 fast-check runs with a fixed seed recorded.
- [ ] Each fault in the table produces the documented retry/backoff or dead-letter result.
- [ ] Repeated runs of the suite show no flaky tests; any quarantined test has an owner and an expiry date.
- [ ] The restore drill output includes the recovery-point timestamp, row counts and checksums.
- [ ] The Lane B smoke test is written up as a host exception with the reason (WebView2 is Windows-only) and stores screenshots.
- [ ] No test or config touches the root domain's MX or DNS records.
- [ ] CI usage stays within 2,000 min/month, or all CI runs locally or self-hosted.
