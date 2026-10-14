# MAIL-818 Mox pilot checkpoint

The combined app transport/ingress source inventory and bounded next seam are
in [the adapter inventory](rhea-adapter-inventory.md).

Scope: isolated `ops/mail/mox-pilot/` synthetic SMTP/IMAP fixture only. Baseline
`bbf2353b254a05d48c2da7a508c143e6fba78691`; source candidate
`d8c68aaa5970d65968bc1943f0eea6f4eb8bfe1d` (the outbox tracks any
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

The Docker request is `MOX_IMAGE=<verified-ref@sha256:...>
PROBE_IMAGE=<verified-python-ref@sha256:...>
MOX_SOURCE_SHA=1c9587665b321199312e11b6a47a0480a9e2750f
MOX_PILOT_LEASE_TOKEN=<lease-id> ops/mail/mox-pilot/scripts/run-pilot.sh`, executed by
Soren on fleet-02 under the Docker lease after application acceptance. Exact
images and command receipt remain pending. Host tests, Docker builds, Docker
runtime, SMTP/IMAP assertions, egress probe, resource measurement, and cleanup
verification are **NOT_RUN** by this worker. Requested tests: accepted local
SMTP and authenticated submission loopback with IMAP receipt, wrong-password denial, permanent recipient failure, temporary recipient
failure, same-volume restart, external DNS/TCP denial, bounded resource
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
