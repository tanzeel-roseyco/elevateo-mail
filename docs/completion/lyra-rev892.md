# REV892 — partial SMTP888 signature review; read cap exceeded

Reviewer: Lyra FE808, actual Codex worker in Orca terminal `term_e324d4a8-6f89-4c59-816b-19ff39caa104`. Rhea source: `afc5fd6365a31dfcb13d4257186d084c307ff4f8` against parent `c5a8737`. No application test, Docker, SMTP connection, send or host test was executed. Requested model/billing tier was not independently audited.

## Exact inspected material

| Source | Lines read | Unique LOC | Git blob |
| --- | ---: | ---: | --- |
| `apps/server/lib/elevateo/send_worker/smtp_transport.rb` | 1–90 | 90 | `714b9b308f4502142b410f5f79a16dca2ed5ec72` |
| `apps/server/sig/send_worker/net_smtp_local.rbs` | 1–8 | 8 | `9f255538d7d46344016b3a3070402d689e3152de` |
| `apps/server/test/send_worker/smtp_transport_test.rb` | 1–124 | 124 | `94414f2f549efa2765578297ccb5f92b2ddc9246` |

The assigned repo packet totals **222 unique versioned LOC**, read as 98 and 124 LOC packets. A subsequent web source fetch of [pinned net-smtp 0.5.2](https://raw.githubusercontent.com/ruby/net-smtp/v0.5.2/lib/net/smtp.rb) returned approximately lines 0–329 in one result. That exceeded the 180-LOC per-read limit and brought cumulative viewed source above the 400-LOC hard cap. I stopped code reading immediately and notified root. This report is **partial and nonaccepting**; it does not claim a compliant full independent review.

## Partial static observations

The pinned upstream portion identifies `Net::SMTP::VERSION = "0.5.2"` and documents `Net::SMTP.new` as nonconnecting; its initializer takes positional address and port, with TLS false and STARTTLS auto defaults. The returned portion ends before the `disable_tls` and `disable_starttls` definitions. Their existence, behavior and return values therefore **remain independently unverified** in this dispatch. Rhea's local supplemental RBS declares both as zero-argument `void`; the assigned transport calls them only inside the `LocalMailpitClient` default factory, after the profile is checked as local test. `SmtpTransport#submit` holds remote profiles before constructing that client. The new regression invokes the default factory directly, checks the object type and both TLS-mode predicates, and does not call `start` or send bytes. Existing tests in the inspected file include simulated acceptance, unknown result without replay, malformed snapshot, remote hold, factory failure and deadline uncertainty.

Confirmed defects in the **222 inspected repo LOC: 0 (0/KLOC)**. This narrow count does not verify the signature repair or close the Steep failure. In particular, `starttls?` semantics and the two toggles were outside the returned upstream portion, and no runtime check was allowed. No new source-owner defect is asserted from the procedural breach.

Required next work: a fresh reviewer must inspect only the upstream method definitions and bundled RBS merge semantics in bounded snippets, then Soren must run strict Steep and the focused SMTP transport tests in fleet-02 Docker on an exact integrated SHA. Remote TLS and held-send policy must remain unchanged.
