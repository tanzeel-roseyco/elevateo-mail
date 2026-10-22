# Self-hosted Mox runtime and private Bundle adapter — 2026-10-23

Scope: inline changes under `ops/selfhosted-mail/` only, plus this report. No commits, implementation agents, production activation, external mail, public ports, DNS changes, paid resources or frontend changes. Coordinator task `task_fe84f2cc9be3`, dispatch `ctx_07b8e333216d` owns acceptance. The held-generation source remains described in `selfhosted-mail-20261023.md`.

## Result and limits

The isolated **production `serve` command** passed real authenticated A-to-B SMTP delivery followed by B's verified-TLS IMAP read, negative authorization probes, populated backup/verifydata, process restart and isolated restoration. This uses generated test accounts, temporary test activation, a private test CA and loopback-only DNS inside a `--network none` container. It does not establish production certificate issuance, public delivery, externally reachable service, real tenant account mappings or production release approval.

No actual operator SQL binding metadata was supplied. The adapter requires actual lowercase account/organization/mailbox UUIDs, the active credential version and `secret:` reference; it never invents those identities. No production Bundle was exported. Backend dispatch `ctx_6594097677c5` was contacted for the format-v1 contract; implementation was checked against the existing backend Bundle/Binding source, and coordinator was told that actual metadata remains an activation prerequisite.

## Pins and isolation

- Fleet machine ID: `5992663e9659484e90c0129edd5bd24b`; shared mutation lease `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock`.
- Existing image: `mcr.microsoft.com/playwright@sha256:35246d87a7c88ea9b771c65d33171b2611b02a8253b4b12ce6f94376c55f99f2`.
- Existing Mox binary SHA-256: `29f054f2b2bc0f191b22576ffbd95fbe74901dae31ac749058c7efb8f61e547c`; runtime version `v0.0.17-go1.27.0`, `linux/amd64`.
- Source production image pin remains `r.xmox.nl/mox@sha256:831c6f11b3c2ee1633077052e6d4b7ae53f73972adf4bf08be0a740121d24cc7`. Its existing extracted binary was used; no image pull/build or version upgrade occurred. Coordinator independently checked upstream latest as v0.0.17.
- Container `mailruntime20261023`: network none, no published ports, read-only root, no-new-privileges, bounded memory/CPU/PIDs, disposable tmpfs. Only source, pinned binary, isolated resolver and task evidence were mounted; no production data or secrets were mounted.
- Fixture DNS binds container loopback UDP53, answers only the synthetic fixture domain and never forwards. This allows actual Mox queue delivery to its own SMTP25 listener without egress. It is acceptance infrastructure, not a production DNS server.

## Runtime evidence

Receipt: `ops/selfhosted-mail/evidence/runtime-20261023/runtime-result.json`; successful run duration **76.736 seconds**. The matching source ledger and run log are retained alongside it.

| Probe | Observed result |
| --- | --- |
| Unauthenticated external relay | Denied |
| Unknown local recipient | RCPT initially 250; final DATA permanently rejected 550; message absent from both owned inboxes and no unknown account created |
| Wrong SMTP password / unauthenticated submission | Denied |
| A sends as B | Denied |
| A authenticated SMTP587 STARTTLS, owned sender | Accepted; queued message subsequently read in B's IMAP993 inbox with verified certificate/name |
| A password used for B | IMAP authentication denied |
| A accesses B's mailbox/sentinel | Denied; B's sentinel absent from A |
| IMAP993 owned APPEND/read | Passed for both accounts |
| Untrusted chain / incorrect server name | TLS handshake denied |
| Populated snapshot + verifydata | Passed |
| Original process restart | Three messages retained |
| New isolated tree restored from snapshot + verifydata | Same three messages retained |

Mox intentionally postpones unknown-local-recipient rejection to DATA (`smtpserver/server.go` around line2770). This report does not mislabel the RCPT250 as an RCPT-stage denial. Earlier unsuccessful iterations are not acceptance evidence: initial RCPT-stage assertions were wrong; backup outside the production sandbox's admitted `data/tmp` failed; the first real SMTP-delivery attempt lacked fixture DNS and timed out. Intermediate two-message restore passes did not prove actual SMTP inbox delivery. The final receipt includes that proof.

## Adapter and preflight

`export_bundle.py` validates exact version/field sets, 1–120 paired actual bindings, protocol uniqueness, identity consistency, generated-account ownership and matching private credentials. Operator metadata includes host/port/TLS requirements: SMTP587 `starttls_required`, IMAP993 `verified_tls`. The resulting private backend Bundle has exactly the eight supported entry fields, including the generated password. Both protocols must share the same complete tenant binding and credential version.

Publication uses mode0600 temporary files, fsync and an exclusive same-filesystem link; a failed write cannot leave a partial final Bundle and an existing Bundle is never overwritten. Rotation/revocation ordering and worker/session restart requirements are documented in the deployment README. Backend SQL authorization/version checks remain authoritative; the Bundle alone does not revoke a live session.

TLS preflight requires a system-trusted chain, server purpose/name, at least fourteen days remaining, a parseable valid private key and matching public keys. A custom CA is available only to the Python test fixture, not the production CLI. Root/ancestor ownership and permissions, checkout exclusion, component symlinks, private file parents, file type/link count/size and DKIM directory admission are checked. DKIM publication is also atomic. `provision.py` now validates private roots and credential parents before any Docker command.

## Review and verification record

Bounded reviews were dispatched by the coordinator; this worker spawned no nested agents. Each assignment was limited to at most200 physical lines, with larger cumulative reviewer totals split into packets. Styling belongs to Ruff, not reviewers. Packet hashes are captured in source ledgers; final-source checks and remaining review receipts are appended below.

| Review | Findings and disposition | Defect density |
| --- | --- | --- |
| Independent validation | One HIGH multicast admission and one MEDIUM reserved example-domain descendant admission; repaired explicitly in `validation.py` with regressions | 20/KLOC initial over100 LOC |
| Generation,107 LOC | One MEDIUM private-root admission; repaired | 9.35/KLOC initial |
| Design tradeoffs | Two MEDIUM: partial final Bundle publication and optimized-away binary pin; atomic publication and explicit pin check repaired with regressions | Coordinator owns packet denominator |
| Private credential parents | One MEDIUM: provisioning bypassed parent admission; private root/file checks added before mutation; final runtime reviewer covered repair | Coordinator accepted bounded coverage |
| Runtime admission,356 initial /372 final cumulative LOC | One MEDIUM: Python -O strips protocol probes inside assertions; entrypoint explicitly rejects optimization before any mutation, regression added; reviewer accepted repair statically | 2.81/KLOC initial over356 LOC; zero remaining over372 final LOC (0/KLOC) |

The optimized-mode guard changes admission only. Strict mypy initially rejected stdlib-supported None arguments in IMAP calls. SEARCH now omits its ignored None placeholder; APPEND retains required positional None flags/date with a narrow `arg-type` exception documenting the bundled typeshed mismatch. An intermediate attempted keyword APPEND omitted required arguments: reviewer found this HIGH defect, the exact-source runtime confirmed TypeError, and `failure-9.json`/log/source ledger preserve it. The repair restores the original proven APPEND call; exact final-source runtime verification is recorded below. This failure is not included in PASS evidence.

Ruff0.11.13, mypy1.15.0, mypy_extensions1.1.0 and typing_extensions4.13.2 were pinned downloaded wheels extracted only inside disposable container tmpfs. Initial check-launch attempts exposed missing pip, noexec tmpfs and Ruff's unwritable default cache; the runner now extracts without pip, explicitly allows executable tmpfs for the pinned tools and disables Ruff cache. These tooling failures are not source-check PASS evidence.

Existing host `trivy`/`grype` executables were unavailable. No vulnerability scan PASS or absence-of-vulnerabilities claim is made; version identification and runtime pin verification are separate evidence.

## Cleanup

Runtime containers use `--rm`; exact task-container absence and exit0 are recorded. No Docker images, build caches, dependency volumes or persistent production data were created. Shared containers/images/services were preserved. Disposable wheel extraction happens only in container tmpfs; cleanup of task staging and temporary downloads is recorded with final verification below. Fleet is Linux, so Windows Docker virtual-disk compaction is inapplicable. Free-space receipts measure the shared host and cannot attribute every delta to this task.


Final APPEND repair review: receipt msg_ab2ce137a81e accepted SHA256 0214b1d54baf1d3ce7c48d9d7cd6d7ba7f3a36f87f570e435ba672e9449262e4 over141 physical LOC, zero actionable defects (0/KLOC). This closes the intermediate HIGH finding statically.

## Final exact-source verification

Final pinned fleet Docker run: runtime PASS in76.736s; all13 unit tests PASS in1.826s. Separate final source check: Ruff PASS, strict mypy PASS for seven new modules, Python/Bash syntax PASS, all13 unit tests PASS in1.823s. Runtime source ledger, live container inspect, final logs and receipts are retained in evidence/runtime-20261023. Earlier successful runtime8 receipt/source are preserved separately, as is failure9.

Windows temporary wheel downloads were retained: automatic approval review rejected the exact verified removal as blocked by policy without a detailed reason. No deletion or retry occurred; windows-cleanup.txt records the path and bytes. No installed applications or shared dependencies were changed.

Reusable fixture sources, existing pinned image and shared binary path were sent to backend dispatch ctx_6594097677c5 for Ruby adapter integration. The shared binary/image are retained. Initial staging cleanup timed out waiting120s for the shared Docker lease; no deletion occurred during that attempt.

## Final cleanup receipt

Per coordinator direction, no Docker mutation lease was needed to remove unmounted exclusive staging. Both exact task containers were independently absent; mount inspection across active containers found zero staging intersections. Removed only /tmp/elevateo-mailruntime20261023 (24,851,679 apparent bytes), including copied source, test certificates, synthetic runtime logs and pinned wheel downloads. Shared-host free bytes increased from73,389,146,112 to73,414,311,936 (25,165,824 bytes); this is an observed host delta, not exclusive attribution. final-cleanup.txt retains checks, private log hashes and free-space receipts. No images, build caches, volumes or persistent data were created or deleted.

Retained Windows path: C:/Users/Tanzeel/AppData/Local/Temp/mailruntime20261023-wheels,24,016,429 bytes. Automatic approval review rejected deletion as blocked by policy without detailed reasoning; no retry occurred. Source and sanitized evidence remain in the repository. No Docker/WSL virtual disk was used locally, so local compaction is inapplicable.
