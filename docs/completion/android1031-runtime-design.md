# ANDROID1031 private installed-runtime fixture design

## Session boundary review

Iris reviewed 400 unique lines in two passes of at most 200 lines under the full user rubric: 0 confirmed existing defects, density 0/KLOC. No tests or runtime actions were performed.

Configure the disposable API with `ELEVATEO_BROWSER_ORIGIN=https://elevateo.qa.internal` and `ELEVATEO_COOKIE_SECURE=true`, omitting `ELEVATEO_LOCAL_HTTP`. Recreate it because Config.current memoizes settings. Cookie issue/deletion explicitly use Secure, HttpOnly, SameSite Strict, path `/`, and no Domain; forwarded scheme does not select cookie security. Preserve separate Set-Cookie headers. Exact Origin, session challenge, context and CSRF checks remain required; never synthesize a valid Origin.

The QA TLS edge must validate exact SNI and Host, reject duplicate/conflicting authority, strip incoming Forwarded, X-Forwarded-*, X-Real-IP and equivalent aliases, and emit canonical HTTPS/443 forwarding. Keep the API internal. A fixed proxy source identity is acceptable for this one-device fixture, with shared rate limits documented; avoid changing application-wide trusted proxy rules. Runtime must prove cookie receipt/reuse/deletion, protected writes, logout/back denial, wrong/missing Origin rejection, bad CSRF rejection and resistance to forwarding spoofing.

Coverage: application_controller.rb:1-12; sessions_controller.rb:1-32; auth_controller.rb:1-97; lib/elevateo/config.rb:1-131; session_challenges.rb:1-41; config/application.rb:1-31; write_controller.rb:1-21; write_input.rb:1-35. Paths are under apps/server. These findings resolve source-level questions in the earlier design below; installed HTTPS/WebView behavior remains unverified.

Status: read-only design, not runtime acceptance. Leah reviewed 396 unique source lines, no pass >200, 0 confirmed existing defects, density 0/KLOC. API34 default x86_64 AVD, no PlayStore, 1536MiB RAM matches the staged x86_64 APK.

Recommended path: Android System Proxy -> 10.0.2.2 Windows loopback -> loopback SSH tunnel -> dedicated fleet Docker CONNECT-only proxy -> exact HTTPS elevateo.qa.internal edge -> existing disposable BE02 database/Auth/API/worker and production web assets. Avoid browser/Grid containers for this lane. Edge/proxy 128–256MiB each, 1CPU, bounded connections/timeouts. Proxy admits only CONNECT elevateo.qa.internal:443 and routes internally; deny every other destination/method. Publish its port only on fleet 127.0.0.1 and mount synthetic seven-day certificate/key read-only.

Existing acceptance routing uses HTTP app.test: routing.ts:4 hardcoded host, upstream.ts:27–30 forwarded host/http/80, compose.acceptance-test.yaml:20–32 browser/Auth origins. Use an explicitly validated QA edge identity, strip incoming forwarding headers then set canonical HTTPS/443 and preserve Origin/cookies. Rails proxy trust and secure-cookie creation require additional review/runtime verification. Reuse acceptance_runtime.py:314–337 overlay/Auth recreation/private synthetic seed; current run immediately executes browsers then cleans up, so add a bounded Android fixture mode.

Tunnel: ssh -N -T -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:19443:127.0.0.1:19443 fleet-02. Record original Android http_proxy; set 10.0.2.2:19443; leave emulator-level proxy unset. Runtime-prove this WebView honors System Proxy. Restore original proxy and stop exact tunnel/VM and Docker resources after QA.

Gates: TLS/login/cookie/reads/protected writes; logout/back; revoke/resume; offline without write replay; keyboard/rotation/insets/accessibility. Distinguish navigation rejection from CONNECT proxy denial, and tunnel loss from genuine Android network-mode behavior. Actual device/release signature/upgrade remain separate.

Official sources: https://developer.android.com/studio/run/emulator-networking-address and https://developer.android.com/studio/run/emulator-networking-proxy . Android documents 10.0.2.2 as host-loopback alias and that browser apps generally honor System Proxy, with exceptions.

Coverage: acceptance_runtime.py:1–170,177,182,194,203,226,241,248,278,284–340; web.Dockerfile:1–25; proxy main.ts:1–19,routing.ts:1–24,upstream.ts:1–42; compose:1–34,51,102,113,126; staged build:13,33,36–43,45–47. Both Android docs and AVD configuration also read. Full user rubric applied; no tests, implementation, emulator start or live mutation.
