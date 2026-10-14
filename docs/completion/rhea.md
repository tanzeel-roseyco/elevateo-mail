# MAIL-818 Mox pilot checkpoint

The combined app transport/ingress source inventory and bounded next seam are
in [the adapter inventory](rhea-adapter-inventory.md).

Scope: isolated `ops/mail/mox-pilot/` synthetic Mox/Mailpit SMTP/IMAP fixture only. Baseline
`bbf2353b254a05d48c2da7a508c143e6fba78691`; source candidate
`669f134f35aa78eff966ae071a1c4cbdbe0a5510` (the outbox tracks any
documentation-only successor). No production integration is
dependent on this pilot. Existing BE02/BE03 contracts and application runtime
are untouched.

Source references: Aster's provisional ADR 0003 and mailserver architecture
select Mox localserve v0.0.17, source commit
`1c9587665b321199312e11b6a47a0480a9e2750f`. The pilot brings in no
third-party source. A Mox image by digest remains a Soren-provided dependency;
the runner rejects mutable tags and requires the source pin. A digest alone
does not prove the image was built from that source, so Soren must record
provenance independently.

SEND-821/MAIL-819 owner seam proposal and protocol fixture boundaries are in
[`adapter-contract.md`](../../ops/mail/mox-pilot/adapter-contract.md). Elara's
SMTP adapter and Corin's held IMAP ingress are owner work, not imported here;
Elara assented to the distinct test SMTP tuple and Corin to the inbound input
shape. Cassian/SQL assent and fleet runtime remain pending. The bounded
[`adapter-negative-cases.json`](../../ops/mail/mox-pilot/adapter-negative-cases.json)
provides owner test inputs for credential rotation/revocation, lost DATA reply
without replay, UIDVALIDITY change and stale inbound credentials; these app
assertions remain **NOT_RUN**.

TLS interop successor: the pilot now exports Mox's generated `localhost.crt`
only, checks default-trust rejection and pinned-trust IMAPS on the upstream
localserve port 1993, and can run Corin's held TLS transport/sync/ingress code
with a synthetic in-memory store from an exact clean owner checkout and
Soren-provided immutable app image. The test container shares Mox's internal
network namespace so `localhost` matches the certificate SAN; peer and
hostname verification remain required. This does not exercise the SQL store
or establish durable cursor or tenant mapping. All TLS/app probes are
**NOT_RUN** until Soren returns exact fleet receipts.

The Docker request is `MOX_IMAGE=<verified-ref@sha256:...>
PROBE_IMAGE=<verified-python-ref@sha256:...>
MOX_SOURCE_SHA=1c9587665b321199312e11b6a47a0480a9e2750f
MOX_PILOT_LEASE_TOKEN=<lease-id> ops/mail/mox-pilot/scripts/run-pilot.sh`, executed by
Soren on fleet-02 under the Docker lease after application acceptance. Exact
images and command receipt remain pending. Host tests, Docker builds, Docker
runtime, SMTP/IMAP assertions, egress probe, resource measurement, and cleanup
verification are **NOT_RUN** by this worker. Requested tests: accepted local
SMTP and authenticated submission loopback with IMAP receipt, wrong-password denial, permanent recipient failure, temporary recipient
failure, bounded DATA timeout, UIDVALIDITY/UID persistence after restart,
Mailpit local stored-recipient proof, external DNS/TCP denial, bounded resource
receipt, and exact cleanup.

Limitations: `localserve` catchall and loopback behavior cannot prove account
mapping, Internet inbound/outbound mail, tenant separation, TLS trust, queue
durability, backups, or production capacity. Aster's resource ceiling is an
admission target only. Production activation stays blocked; no live spend,
credentials, listeners, SMTP, DNS or Hetzner mutations occurred.

Design simulation for root: localserve supplies one small protocol fixture,
but its convenient catchall hides authorization errors. A production seam
would require explicit Rails policy and stable account mapping before any
server observation could become a mailbox event. SMTP acceptance remains a
queued/unknown state, never a delivery guarantee.
