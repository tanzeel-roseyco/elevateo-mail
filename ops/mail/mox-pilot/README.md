# MAIL-818: isolated Mox protocol pilot

This is a synthetic protocol fixture, not a mail transport activation. It does not
change the Rails provider selection, application contracts, DNS, public listeners,
or production credentials. Aster's provisional choice is Mox `localserve` v0.0.17,
source commit `1c9587665b321199312e11b6a47a0480a9e2750f`.

## Inputs and isolation

Soren supplies a locally available Mox image by immutable digest as `MOX_IMAGE`.
The image provenance must resolve to the source commit above; a floating tag is
rejected. Run `scripts/run-pilot.sh` only on fleet-02 under Soren's Docker lease.
It creates one internal-only Docker network with no published ports and a
disposable named data volume. Containers have no host socket, secrets, app
database, or persistent application volumes. The runner refuses a non-fleet
hostname and a missing lease token. The DNS and egress-denial probes in the
runner must pass before any protocol result can be admitted.
The named volume root exists when mounted. Mox localserve must initialize an
absent child at `/pilot-data/localserve`; pointing `-dir` at the volume root
fails at first start. `-ip 0.0.0.0` binds only inside the internal Docker
network. No ports are published to the host.

The fixture uses `.test` addresses and Mox's generated `mox@localhost` account
with its documented localserve development password. Those credentials are
fake and fixture-only. The default account's catchall behavior means an SMTP
success alone cannot prove per-account routing or tenant isolation. A mail
client receives with IMAP from the default account to confirm local loopback.

## Test request to Soren

Supply `MOX_IMAGE` as a verified immutable digest and `MOX_SOURCE_SHA` as the
pin above, then run `MOX_PILOT_LEASE_TOKEN=<lease-id> scripts/run-pilot.sh` on
fleet-02 after application acceptance. The script is deliberately not run by
this worker. It checks one accepted local message, a `permerror` recipient,
and a `temperror` recipient; verifies IMAP receipt for the accepted message;
checks DNS and external TCP egress denial; collects bounded logs and resource
figures; and removes only its own containers/network/volume. Preserve the
receipt directory outside the disposable runtime.

The script uses a 2 GiB/2 CPU container cap, 5 GiB preflight free-space
minimum and a 15-minute process deadline. A 5 GiB free-space check is an
admission guard, not a hard volume quota; Soren must verify actual disk use.
Do not treat localserve's self-signed TLS, catchall delivery, or loopback
submission as production security, Internet deliverability, or tenant proof.

## License and protocol limits

Mox is MIT licensed; bundled dependencies include BSD-3-Clause and MPL-2.0
material, so an eventual distributable image needs its exact notices reviewed.
No Mox source is copied into this repository. This fixture exercises SMTP and
IMAP only. Mox may expose HTTP APIs, but no authenticated API or webhook
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
