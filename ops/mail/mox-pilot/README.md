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

The concurrent Mox/probe limits total 1.75 GiB and 2 CPU, within the
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
