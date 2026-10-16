# ANDROID1035: installed APK acceptance and private transport

The installed QA APK reaches the real isolated Auth/Rails fixture through verified HTTPS and a fixed-destination CONNECT edge. The host-published listener was replaced by an owner-only UNIX socket: the emulator relay connects to that socket, and the independent probe has no network interface. Internal Compose services publish no ports. No live credentials, outbound mail, DNS, production mutation or paid operation occurred.

## Evidence and observed result

Source baseline `1c345911bb306f71ecaa153f9b38760272fa2c79` plus the exact overlays in `android1035/proxy-result.json`. Final proxy gate `android1035-unix-f1ae9de59549`:112 Python tests,9 socket/TLS tests,strict TypeScript passed. Emulator harness19 tests passed. APK SHA256 `a4611c88c2d33124a1a6a01c2bc3e572aaddbad0ad724a70b52f71e8157ad626`, Android14, WebView113.0.5672.136, package `com.elevateo.mail.qa`.

Full gate `android1035-ab65bce1fad4` FAILED. Login, inbox, individual thread/message links, literal message rendering, separate personal/outreach navigation and session resume/relaunch passed. Rotation exposed system-bar overlap. Airplane mode plus disabled WiFi/data produced OS `Active default network: none`, while WebView reported online; the app removed protected content after session refresh failed and recovered through Try again. Logout was not completed: an initial selector matched a disabled organization button, then the emulator exited before correction. No logout success is claimed.

The emulator exited1, OOMKilled=false, last graphics diagnostics `Failed to find ColorBuffer:107` / invalid color buffer. Root cause is unresolved; this is not proof of an application crash. The outer gate records app_acceptance NOT_RUN on exception, while the detailed acceptance record correctly says FAILED; use the latter. Both records are preserved, not rewritten as successes.

## Cleanup and identity

Independent `android1035/independent-cleanup.json` verifies35 exact Docker resources/private fixture paths/work directories absent, including fixture containers, builder/cache, images, volumes, network and generated private credentials/TLS. Shared pinned bases, persistent data and the retained QA APK/build TLS artifacts remain. Full-gate free bytes254224130048 ->254153338880 (delta-70791168); focused gate254169976832 ->254153019392 (delta-16957440). Shared-host deltas are not attributable reclamation.

Execution: SSH fleet-02 Ubuntu-noble-latest-amd64-base.zst, UID/GID1001, Docker/KVM; no emulator or Docker workload ran on the Windows workstation. Coordinator identity is Codex; actual serving model cannot be independently measured. Reviewers requested gpt-6.1-sol low effort. Review details and ten resolved findings are in code-reviews.md. Screenshots/logs retained at `/home/tanzeel/elevateo-mail-completion-20261015/control/qa815-artifacts/android1035-ab65bce1fad4`.

## Design review and next fixes

Private UNIX transport trades an additional bounded relay for avoiding a loopback TCP endpoint shared by all host users. Same-UID task processes remain in the same trust boundary; owned0700 directories and0600 sockets are not isolation from that UID. Relay connections are capped, bytes/deadlines bounded, TLS hostname/CA validated, and half-close preserves reverse-direction bytes. This was independently reviewed and regression tested.

Native insets should own system-bar/cutout geometry on the older WebView, where CSS safe-area information was absent; repeated rotation must assign absolute values. The normal ACCESS_NETWORK_STATE permission is the smallest connectivity correction to test before adding another listener/plugin. Preserve keyboard behaviour and verify actual runtime. Dedicated design simulation: portrait top/bottom, landscape side bars/cutout, repeated rotation, keyboard, cold offline and resume. Obsidian connector is unavailable; this decision is recorded in the local project vault mirror.

This is not credentials-only readiness: native corrections/retest, upload HTTP/Storage integration, outbound attachment MIME, final browser/native acceptance and operational checks remain open.
