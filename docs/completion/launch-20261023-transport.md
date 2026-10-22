# Transport repair ? task_639ff7b883f2

Changed only `ops/railway/check-transport.sh` and this receipt; no commit, application,
UI, live API, infrastructure configuration or production changes. AIDEV anchors were
searched before editing. The final script is 182 physical lines, SHA256
`136ffeec925e9846bd662c57a9eefa6f8d2263208d62f9effdf0802071080eca`.

## Findings and repair

Independent review of the preceding 146-line script found two MEDIUM defects,
13.70 defects/KLOC: occupied Unix-listener false acceptance and incomplete cleanup
verification/error propagation. Both are repaired; independent re-review remains
coordinator-owned, and this receipt does not claim independent approval. The entire
182-line script fits one <=200-line functional review packet; a separate dedicated
design review should assess cleanup ownership and policy-oracle independence.

The remote Unix listener now uses `/tmp/denied-listener.sock`, separately checked
absent. A forwarding-user socket bind/close proves that the directory is writable;
the disposable server tmpfs uses mode 1777 so filesystem permissions cannot explain
the refusal. The client must report the exact rejected listen path AND `Server has
disabled streamlocal forwarding`; effective config must say
`allowstreamlocalforwarding no`. The independent existing `/tmp/forbidden.sock`
fixture still establishes a reachable target for the local Unix denial. Only the
fake daemon receives DEBUG1 logging; a daemon refusal also verifies local policy.

Preflight and cleanup use checked Docker listings, rather than interpreting any
failed inspect as absence. Cleanup propagates builder/image/container/network/volume
and key removal errors, inspects mounts before removal, and verifies exact absence
of all task containers, the dedicated builder, image, cache volume and network.
Any leftover exact cache volume is inspected and checked for attached containers
before removal; no shared resources or broad prune are involved. A listing failure
makes cleanup fail and prevents deletion based on that untrusted inventory.

## Exact fleet runtime and regression evidence

All execution used fleet-02 Docker in `/tmp/elevateo-launch-20261023-transport`,
with its existing exclusive `lease`; no host application test ran. Final real-script
run exited 0 with `PASS transport checks` and `CLEANUP exit=0`, retaining both
allowed forwards and all previous denial/isolation checks. Before this final source,
two incremental real-script runs also passed; they do not replace final-source proof.

Final artifacts in that fleet directory:

- `repair-run.log`: 23,289 bytes, SHA256
  `c50fa99b8f4a3ba09d98f553f0c16fa8b3b422d6ef0cf83e17e764f064bad662`.
- `sshd.log`, `effective-config.txt`, `container-inspect.json`: nonsecret disposable
  daemon evidence; logs include only generated test identities and fake upstreams.
- `cleanup-negative.sh` and `cleanup-negative.log`: reproducible eight-case harness,
  the latter 317 bytes, SHA256
  `636c4b58ed18c227c3c898c595f1c9b954b718eb04403b7558da00ff697d0a0d`.
- `repair-audit.sh`, `repair-cleanup-evidence.txt`: independent checked inventory.

The negative harness runs extracted inventory/cleanup functions from the exact final
script inside a socket-free, read-only `node:22-bookworm-slim` Docker container with
network disabled and disposable tmpfs. Its mocked Docker returns: clean success;
builder/image/volume removal errors even though the resource then disappears;
builder/image/volume residuals despite successful removal commands; and inventory
failure. All eight expectations passed (clean exit 0; seven failure cases exit 1).
The one-off container used `--rm`; the shared pre-existing Node image was retained.
An initial harness launch misplaced stdin flags and entered Node's empty interactive
prompt; it exited without running cases and is not counted as a pass.

## Cleanup and remaining acceptance

Mounts were printed before exact removal. The final task image
`sha256:e77a35db2690359ff87eb26eebced644b838b3b3a2b44b27b0716a82477724c1`,
four fake-service containers, dedicated BuildKit builder/cache volume, internal
network and generated keys were removed. Independent checked inventory confirmed
exact builder/container/image/volume/network/key absence, including the negative
harness container. Nonsecret reports/source and pre-existing shared images and
persistent data remain. No broad prune, host privilege escalation or compaction ran.
Final host available space was 67,970,576,384 bytes; shared concurrent activity makes
attributable reclaimed bytes unknown. Remote Linux requires no Windows WSL compaction.

No publication or production acceptance is inferred. Independent source/design
re-review, central review-ledger integration and any Obsidian tradeoff simulation
remain coordinator-owned; no nested worker was launched or actual vault modified.
The earlier receipt below is preserved as historical evidence, not final approval.

---

# Isolated transport verification — task_7232b18516ab

The historical 146-line `ops/railway/check-transport.sh` passed on fleet-02 using only
disposable keys, fake HTTP upstreams and a fake Unix socket. The exact script SHA256
is `eaf2c934e2d766fde9faee286d7127d06355293c1805a1d0ba18a403d9299fe0`.
The worker did not modify the three coordinator-owned transport infrastructure files,
root edge files, frontend or production composition. No deployment occurred.

## Runtime evidence

`launch-20261023-transport/run.log` records both permitted HTTP forwards and rejection
of command sessions, arbitrary destination ports, loopback forwarding, remote TCP,
remote Unix, local Unix, wrong host pins and unauthorized public keys. The Unix
fixture was independently reachable from inside the SSH server container, so its
forwarding failure cannot be explained by an absent socket. Correct host pins use
the explicit `[transport]:2222` identity.

The daemon had effective capability mask `00000000000400c0` (SETUID, SETGID,
SYS_CHROOT), NoNewPrivs=1, read-only root and key mounts, and one isolated network.
The only bind mount was the task-owned disposable key directory. Resource limits
were 32 PIDs, 96 MiB and 0.25 CPUs. Effective daemon configuration and full container
inspection are retained alongside the log. Tests did not publish a host port.

The profile was exercised through Docker-run equivalents with the real Dockerfile
and sshd configuration. Production compose merging, firewall exposure, real edge
connectivity and real application/provider/browser behavior remain unverified.
The final run exited 0 with `PASS transport checks` and `CLEANUP exit=0`.

## Cleanup

Cleanup printed mounts before removing the exact four test containers, isolated
network, task image, dedicated BuildKit builder/cache volume and disposable keys.
A separate inventory found no matching containers, network, image, builder, cache
volume or key files; see `cleanup-evidence.txt`. Nonsecret reports and source remain.
No shared image/cache prune or host privilege escalation was used. Shared Docker
images, unrelated workloads and persistent data were retained.

Host available bytes rose from 66,143,830,016 during the preceding build to
72,565,497,856 after final cleanup. The observed increase is 6,421,667,840 bytes;
concurrent shared-host activity prevents attributing that entire delta to this task.
Windows Docker/WSL compaction does not apply to this remote Linux Docker run.

## Bounded review and limits

Packet A reviewed all current infrastructure: Dockerfile 8 lines, sshd_config 33,
compose overlay 33; 74 LOC total, zero confirmed infrastructure defects, 0/KLOC.
The dispatch described 77 LOC; actual current physical source count is 74.
Packet B reviewed the full 146-line harness, with eight repaired development defects
(54.79/KLOC): missing Docker stdin, masked cleanup status, incorrect mount count,
over-specific shell diagnostic, non-port-qualified pin fixture, ineffective readiness
request, an unproven/racy local Unix fixture, and missing builder-mount inspection. Earlier partial attempts failed
and are not acceptance evidence. That inline zero-defect claim was superseded by the independent findings below.

These are inline worker review passes, not independent adversarial approval.
Independent functional and dedicated design reviews were requested from the coordinator;
no nested workers were started. Formatting remains a linter concern. Root owns any
Obsidian design simulation/vault update; this report does not claim either occurred.

The bounded design choice is to retain root only inside the isolated daemon so SSH
can drop identity and chroot its unprivileged pre-auth process, rather than requiring
host administration. Runtime probes demonstrate that minimal capabilities work with
read-only filesystems. This buys separation from host credentials and private data,
while leaving deployment network/DNS integrity, key rotation and availability as
activation responsibilities. Host-admin changes were neither needed nor attempted.
