# MAIL-818: isolated Mox protocol pilot

This is a synthetic protocol fixture, not a mail transport activation. It does not
change the Rails provider selection, application contracts, DNS, public listeners,
or production credentials. Aster's provisional choice is Mox `localserve` v0.0.17,
source commit `1c9587665b321199312e11b6a47a0480a9e2750f`.

## Inputs and isolation

Soren supplies the locally available pinned Mox image
`r.xmox.nl/mox@sha256:831c6f11b3c2ee1633077052e6d4b7ae53f73972adf4bf08be0a740121d24cc7`
as `MOX_IMAGE` and independently records its release/source provenance.
The image provenance must resolve to the source commit above; a floating tag is
rejected. Run `scripts/run-pilot.sh` only on fleet-02 under Soren's Docker lease.
It creates one internal-only Docker network with no published ports and a
disposable named data volume. Containers have no host socket, secrets, app
database, or persistent application volumes. The runner refuses a non-fleet
hostname and a missing lease token. The DNS and egress-denial probes in the
runner must pass before any protocol result can be admitted.
The named volume root exists when mounted. A read-only guard refuses an
existing child, then the one-time `init` service creates
an absent child at `/pilot-data/localserve`; pointing `-dir` at the volume root
fails at first start. Only init passes `-ip 0.0.0.0` to write the internal
listener address. A normal startup and same-volume restart omit `-ip`, because
Mox rejects that flag with existing config. No ports are published to the host.

The fixture uses `.test` addresses and Mox's generated `mox@localhost` account
with its documented localserve development password. Those credentials are
fake and fixture-only. The default account's catchall behavior means an SMTP
success alone cannot prove per-account routing or tenant isolation. A mail
client receives with IMAP from the default account to confirm local loopback.
The pilot also uses the application's pinned local Mailpit image sequentially;
neither service has an external relay or published port.

Mox localserve generates a self-signed certificate with `localhost` in its DNS
SAN and serves implicit TLS IMAPS on **1993**, not 993. The one-time
`cert_export` container copies only `localhost.crt` from the disposable Mox
volume into the private 0700 receipt directory as this run's trust anchor;
the key stays in Mox's volume. `tls_probe` shares Mox's private network
namespace so `localhost:1993` reaches that listener with peer and hostname
verification enabled. It first requires default trust to reject the peer,
then requires explicit pinned trust to pass. No port is published or TLS check
disabled. This generated leaf is a test trust anchor, not a production CA.

## Test request to Soren

Supply `MOX_IMAGE` and `PROBE_IMAGE` as verified local immutable image references
(`sha256:...` image IDs or `name@sha256:...` digests) and `MOX_SOURCE_SHA` as the
pin above, then run `MOX_PILOT_LEASE_TOKEN=<lease-id> scripts/run-pilot.sh` on
fleet-02 after application acceptance. The script is deliberately not run by
this worker. It checks accepted local SMTP, authenticated submission loopback, IMAP receipt,
wrong-password denial, a `permerror` recipient, a `temperror` recipient and a
bounded DATA timeout; then it checks the original IMAP UIDVALIDITY/UID and
synthetic MIME digest after a same-volume restart. It stops Mox before starting
Mailpit, sends one `.invalid` synthetic message and confirms its stored
recipient via Mailpit's bounded HTTP API. Both probes check external TCP
egress denial; Mox also checks external DNS denial. The runner collects logs and resource
figures; and removes only its own containers/network/volume. Preserve the
receipt directory outside the disposable runtime.

The TLS probe also checks verified IMAPS login, wrong-password denial, UID
fetch/replay and the same MIME digest before and after restart. To exercise
Corin's actual **held** `TlsImapTransport` → `ImapSync` → `ImapIngress` path,
Soren may additionally supply a locally available immutable `APP_TEST_IMAGE`,
an absolute clean `APP_SOURCE_DIR` at exact committed `CORIN_SOURCE_SHA`, and
run the same script. Its optional Compose override mounts owner source
read-only, joins the Mox network namespace, passes the generated test trust
anchor through `ca_file`, and uses only an in-memory synthetic store. It
asserts login, message ingestion, cursor advance, duplicate UID replay and
same-volume restart observations. The optional container runs as root solely
to access the private receipt directory; caps are dropped and the app source
is read-only. It does **not** prove SQL authorization or durable cursor commit.
Without those three optional inputs, app interoperability is **NOT_RUN**.
The runner always writes `component-status.txt`: omitted app inputs set
`corin_initial=skipped_missing_inputs`, `corin_restart=skipped_missing_inputs`
and `interop_result=not_run_missing_inputs`, even if base protocol exits 0.
Only both successful Corin probes plus verified cleanup can set
`interop_result=pass`. A partial input set fails admission. A failed earlier
probe leaves later components `not_run` and the result `incomplete`.

Exact Soren command after image/source provenance and Docker lease admission:

```sh
MOX_SOURCE_SHA=1c9587665b321199312e11b6a47a0480a9e2750f \
MOX_IMAGE=r.xmox.nl/mox@sha256:831c6f11b3c2ee1633077052e6d4b7ae53f73972adf4bf08be0a740121d24cc7 \
PROBE_IMAGE=<verified-local-python-image@sha256:...> \
APP_TEST_IMAGE=<verified-local-app-image@sha256:...> \
APP_SOURCE_DIR=<absolute-clean-Corin-checkout> CORIN_SOURCE_SHA=<exact-Corin-commit> \
MOX_PILOT_LEASE_TOKEN=<actual-lease-id> ops/mail/mox-pilot/scripts/run-pilot.sh
```

Omit all three `APP_*`/`CORIN_SOURCE_SHA` inputs for protocol-only mode. Both
modes require Soren on fleet-02; no image pull/build or host application test
is performed by this packet. Receipts include `cert-export.log`, TLS logs,
optional Corin interop logs, exit status, resource figures and exact
task-owned cleanup/absence files.
Each Docker container, network and volume inventory query is independently
bounded; a timeout or failed query records `cleanup_verification=unverifiable`
and makes the runner exit nonzero. Soren must reconcile the recorded project
name before another attempt. A nonempty inventory records
`cleanup_verification=residual_resources` and also fails. The regression
`tests/runner_receipt_test.sh` uses fake Docker commands to check omitted
interop and simulated inventory timeout; Soren alone runs it inside a fleet-02
Docker test container with `MAIL818_RUNNER_TEST_CONTAINER=1`. It has not run
in this branch.

Bounded regression command for Soren under the fleet lease, using a locally
available immutable image with Bash and coreutils (no pull or build):

```sh
docker run --rm --network none --read-only --tmpfs /tmp:size=32m \
  -e MAIL818_RUNNER_TEST_CONTAINER=1 \
  -v "$PWD:/src:ro" -w /src "$RUNNER_TEST_IMAGE" \
  bash ops/mail/mox-pilot/tests/runner_receipt_test.sh
```

Soren records the exact image digest, exit, assertions and exact task-owned
container absence. This fake-Docker regression never starts Mox or an app.

The concurrent Mox/probe limits total 1.75 GiB and 2 CPU; optional Corin
interop plus Mox caps at 2 GiB and 2 CPU, within the
2 GiB/2 CPU pilot ceiling. It preflights 5 GiB free space and budgets
14 minutes for protocol work plus 1 minute for cleanup. The Mailpit phase runs
after Mox stops and uses less memory/CPU. A 5 GiB free-space check is an
admission guard, not a hard volume quota; Soren must verify actual disk use.
Do not treat localserve's self-signed TLS, catchall delivery, or loopback
submission as production security, Internet deliverability, or tenant proof.

## License and protocol limits

Mox is MIT licensed; bundled dependencies include BSD-3-Clause and MPL-2.0
material, so an eventual distributable image needs its exact notices reviewed.
No Mox source is copied into this repository. This fixture exercises SMTP and
IMAP plus Mailpit's local inspection API only. Mox may expose HTTP APIs, but no authenticated Mox API or webhook
mapping is proven here. No JMAP, OAuth2, delegated mailbox ACL, inbound public
MX, external outbound delivery, spam reputation, backup restore, restart, or
capacity result is claimed. Mox's production Docker warning remains a separate
deployment constraint. The existing Resend/Mailpit app boundary remains intact.

## Design tradeoff for root

One localserve process can supply deterministic SMTP accept/reject and IMAP
receive behavior with low setup cost. The same loopback/catchall shortcuts hide
real account mapping and outbound failure modes; a later production evaluation
needs native Linux deployment, explicit per-account routing, queue recovery,
TLS/authentication, ingress, backup restore, and external egress policy evidence.
Keep this fixture isolated even if those later gates pass.

Elara/Corin/Cassian's proposed evidence and cursor seams are in
[adapter-contract.md](adapter-contract.md). They are not activated here.
