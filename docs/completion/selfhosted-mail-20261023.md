# Self-hosted mail deployment — 2026-10-23

Task task_cbcfa9c54d58 / ctx_b3f3e7b35f6c. Only new ops/selfhosted-mail files
and this report changed by this worker. No commit, deployment, DNS mutation,
mail/API call, Resend use, purchase or persistent-stack mutation. Existing Mox
integration reused. Domain inputs remain unassigned and operator verified.

## Delivery and verification

Pinned amd64 host-network Compose, exclusive private held-config generation,
explicit 120-row CSV/domain binding, 256-bit per-account credentials, exclusive
DKIM keys, TLS/config preflight, stdin password provisioning, Mox snapshot helper
and host/Coolify/application/restore runbook are in ops/selfhosted-mail.

Fleet-02 Docker, existing soren-docker.lock, task container namespace
selfhosted-mail-20261023-cbcf. Existing shared image:
`mcr.microsoft.com/playwright@sha256:35246d87a7c88ea9b771c65d33171b2611b02a8253b4b12ce6f94376c55f99f2`.
No pull/build. Tests network=none, read-only root/source mounts, cap-drop ALL,
512MiB memory,128 PID limit,128MiB /tmp tmpfs; containers --rm.

Final command: `python3 -m unittest discover -s /src -v` inside that container.
Result: **6 tests PASS, 0 failures, 0 errors, 0 skipped, 0.450 seconds**.
Coverage: valid120 private generation/nonoverwrite; bad/empty/duplicate manifest
and capacity/domain failures; provisioning all-input validation before mutation,
redacted argv and failed-command behavior; real Mox config parser with120 held
accounts, generated DKIM and test TLS; explicit CSV mapping plus missing and
unauthorized-domain failures. No credentials printed or stored outside tmpfs.

Mox parser binary SHA256 independently read:
`29f054f2b2bc0f191b22576ffbd95fbe74901dae31ac749058c7efb8f61e547c`.
This validates the existing pinned binary/config, not a running production mail
server or application. Early test invocations failed import/file access because
task staging was0700 and container root had DAC capability removed. Making only
the nonsecret task source staging0755 corrected admission; final suite ran.

No linter/typechecker, full Compose startup, public TLS, SMTP/IMAP exchange,
application connection, offsite backup/restore or provider port probe is claimed.
No additional dependency installation was performed.

## Exact cleanup

All disposable containers automatically removed; task-name docker ps -a query
returned empty. Verified realpath of `/tmp/elevateo-selfhosted-mail-20261023-cbcf`,
then removed that exact52KiB source staging directory and verified absence.
Tmpfs generated credentials/keys vanished with containers. No images, build
cache, volumes, persistent directories or other jobs removed. Shared image and
original pinned binary retained; zero new image/cache storage. Host free space
was66GiB (437GiB filesystem); no Windows Docker disk was used or compacted.

## Review handoff

Independent reviews belong to coordinator; none claimed here. Bounded packets:

| Packet | Source | Lines |
|---|---|---:|
| 1 | validation.py |100|
| 2 | generate.py + keys.py |107|
| 3 | provision.py + import_plan.py |82|
| 4 | compose.yaml + preflight.sh + snapshot.sh |70|
| 5 | test_deployment.py + test_import.py |150|
| Design | README.md |141|

Implementation self-check corrected a preflight import path, test assertion,
symlink-resolved output admission and duplicate credential JSON admission.
Independent defect count/density: NOT YET MEASURED; root must record accepted
review results in code-reviews.md. No blanket approval or zero-defect claim.

Activation gates: exact verified brand/domain/host assignment, Workspace-safe
DNS/PTR/SPF/DKIM/DMARC, trusted TLS/renewal, dedicated ports and provider25,
firewall and quota checks, current image security review, offsite restore proof,
independent review, and tenant-scoped production secret-store adapter. README
specifies smallest adapter packet; held/test-only credential paths cannot be
called production integration. No claim of production readiness until these
gates pass. All accounts and domains generated disabled; no warmup network.

## Source SHA256

```text
compose.yaml f0c5f22ca2945af040918fcd8cf64604c0ac36c2a24dda75265730bc44e54342
generate.py 9d8dcf4e61fb0b730045a2b19f0f6c7526fcde1b6ac1f504d9948d750a700e81
import_plan.py de45c51a08a8e354b8d0e7a5e41eafa57f46680d1503698897f41edc0b3e3fff
keys.py 80c9153a4ccdba6a631afc04182e2cc5441e3d1c44ef5fb6449f2c4040e18c1b
preflight.sh b8a8d9e6db3fe3f656a417958b277c9e51974a2de7d8aa0f5caeb1e4916b8a98
provision.py 3e9c7ac4280168e4695153e212cd05c60170f067c9dfe78778f1812e4093c528
README.md 1f99ea2564159a6992d2394574683cc8138413a961dc0d224e67e1d76123b21f
snapshot.sh d2a1186af140d9c4435d7c0f7840c86c6278c533c8bb31774056ee34f4f94a61
test_deployment.py 53b6df903622fe49bc235895ed4032fd2a14e125bdf3a8644a201fb7502f6e19
test_import.py 2ad16ade17752e60f550e1b8289518032e73797d7ceed1b42f0ec6207755acc7
validation.py b9b394d54d99b6de5448de490717c24f4141501ba7d3e40da0025451e15628fe
```
