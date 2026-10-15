# Mail runtime and REA evidence

MAIL1022: Durable mailbox rotation prevents one busy mailbox from monopolizing due-job discovery. All712 synthetic mailboxes received one opportunity before the1000-job backlog received its second; selector p95 23.04ms, maximum48.17ms, eight concurrent lookups maximum193.12ms with3s statement/1s lock limits. Fleet-02 gate be02-d1d8d767a42e44f79a8ea17f24a92e80 passed157 standard suites/927 tests/10,806 assertions; Mox10/109, HTTP1/33 and worker-entry2/107; combined940 tests/11,055 assertions with zero failures/errors/skips. Twelve dedicated suites remain deferred. Steep, RuboCop359 files, fixture lint3 files, frozen source and exact cleanup passed;17 independent absence checks passed. Shared bases/persistent data retained; free bytes254850682880 ->254832197632 (shared delta-18485248, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Held profile composition, production secrets, multi-account ingestion and app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/mailbox-rotation.md.

MAIL1020b / MAIL1021: Held Mox attempts now atomically reserve daily recipient budgets across organization, group, mailbox, sender domain, shared egress pool and destination domain. Unknown delivery retains charges; late-axis denial rolls back the entire reservation. Worker admission now clamps idle waits and rechecks the clock after discovery; in-flight work retains its own deadlines. Fleet-02 gate be02-43e4649a15314558bc7d7ac7a54f4310 passed: 153 standard suites/915 tests/9,911 assertions; Mox10/109, HTTP1/33 and worker-entry2/107; combined928 tests/10,160 assertions, zero failures/errors/skips. Twelve dedicated suites remain deferred. Steep, RuboCop352 files, fixture lint3 files, frozen source and exact cleanup passed;17 independent absence checks passed. Shared bases/persistent data retained; free bytes254839009280 ->254853779456 (shared delta+14770176, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Fair scheduling, operational activation and remaining app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/aggregate-send-budgets.md.

MAIL1020a: SMTP attempts now bind organization, mailbox, account, credential version, reference and protocol; final authorization rechecks sender/account state before the held Mox transport resolves credentials. Fleet-02 gate be02-cab695ff6bd6445d9fd4dc6b19a3165e passed: 148 standard suites/888 tests/9,621 assertions; Mox10/107, HTTP1/33 and worker-entry2/107; combined901 tests/9,868 assertions, zero failures/errors/skips. Twelve dedicated suites remain deferred. Steep, RuboCop344 files, fixture lint3 files, frozen source and exact cleanup passed;17 independent absence checks passed. Shared bases/persistent data retained; free bytes254805770240 ->254871015424 (shared delta+65245184, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Aggregate budgets, scheduling, operational activation and remaining app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/smtp-account-binding.md.

## Historical MAIL1018 held worker and inbox composition

The successful fleet-02 gate is `be02-efaf3b7cb1de4ef7a08428120328bc12`, under
`/home/tanzeel/orca/workspaces/integration/completion-cassian-int801/ops/local/`.
The gate's `source.sha256.json` binds the tested files. No public ports, production credentials,
external mail or purchased services were used. The production remote profile remains held.

The standard Ruby gate reports 140 suites, 839 tests and 8,922 assertions. The real Mox composition
adds 3 tests/74 assertions; authenticated HTTP acceptance adds 1/33. Total: 142 suite summaries,
843 tests/9,029 assertions, zero failures/errors/skips. Twelve dedicated suites are explicitly
deferred; this is not all application/native acceptance. Whole-server Steep has no errors;
canonical RuboCop passes 327 files and Mox RuboCop passes two fixture files. The separate unit
gate passes 96 tests: 77 BE02 runner, 8 OPS820 and 11 mailserver tests.

The Mox fixture traverses PostgreSQL approval, restricted worker execution, verified STARTTLS,
versioned receipt storage, TLS IMAP import, durable cursor/receipt and tenant inbox/RLS visibility.
A delayed acknowledgment leaves the send unknown and does not resend; revoked inbound account
access fails before a second credential lookup/connection. The fixture is not a production
credential resolver, aggregate quota implementation or proof of external inbox placement.

`result.json`, `cleanup.json` and `mox-cleanup.json` pass. Cleanup removed five task containers,
one builder container and registration, three task volumes, one network and one application
image. Independent exact inspection confirms 17 resource/private-file entries absent, including
both Mox containers and synthetic credential files. Shared bases and persistent data remain.
Host free bytes changed 254,982,402,048 to 254,996,930,560: +14,528,512 bytes (13.86 MiB), a
shared-host delta rather than attributable reclamation. No disk compaction was performed.

Earlier attempts remain failed evidence: `be02-455...` reached Ruby/Mox success but failed an
inconsistent broader style gate; the corrected runner uses the existing canonical lint policy.
A prior fixture ownership failure was corrected with private exclusive creation, ownership set
before writing, close-before-ready handoff, and four regressions. The independent cleanup probe's
first run failed to recognize Docker's `no builder ... found` response; its corrected absence
predicate passes. No failed overall run is relabelled as passed.

Review and design coverage is recorded in `code-reviews.md`. MAIL1019 onward remains work.

## Artifact provenance

Upstream Mox v0.0.17, source commit
`1c9587665b321199312e11b6a47a0480a9e2750f`, MIT license, was selected without modifying its
authentication, cryptography or spam checks. The Linux/amd64 OCI manifest is
`r.xmox.nl/mox@sha256:831c6f11b3c2ee1633077052e6d4b7ae53f73972adf4bf08be0a740121d24cc7`.
The release tag is `v0.0.17-go1.27.0-alpine3.24.1`; its index digest is
`8889e7b48fdd5b0b07b51dd11a6d06536334ec442652f2ffb1e1df3a9d45074e`.
The extracted 39,933,271-byte executable reports v0.0.17-go1.27.0. Its SHA-256 is
`29f054f2b2bc0f191b22576ffbd95fbe74901dae31ac749058c7efb8f61e547c`.
The release metadata image.json SHA-256 is
`a7f83fe9a241181b8a4c0687ec26b5849d990d96658db9b73d31c6d39d79b2cf`.

REA skill version 37 was applied to the shipped executable. REA successfully opened and
identified the ELF/x86_64 artifact and the same digest; see evidence/rea-open.json. Both artifact
inspection attempts failed with provider `rea-artifact-graph` / `execution_failure`; their exact
errors are retained. No decompilation, artifact-graph or successful proprietary-runtime claim is made.

An analyst-created evidence ZIP has locally measured SHA-256
`528ee0c8cd769f1041bbe21f835aaff8b0e45d9a5a36ebd74da23ecfd7ecc2f2` and is not an upstream
distribution. Its retained inspection receipt also reports failure. ZIP opening, snapshot-close
failure (evidence_integrity_mismatch), subsequent close without a snapshot, and closure of all REA
sessions were observed during this session but do not have retained receipts. These observations
are not durable verification evidence. Readable upstream source and actual private protocol
observations provide the behavioral evidence.

## Real Mox serve, network disabled

`mail1017-r7` used real `serve`, not localserve, on fleet-02 in a bounded container with
network=none, no published ports, loopback synthetic DNS/certificates and synthetic .test mail.
Seven plan tests pass. The 712-account held configuration parses; a correct password cannot
bypass disabled login, and a disabled domain rejects delivery with the expected temporary refusal.

The runtime provisions 700 accounts and 700 passwords in 78.28 seconds. Eight accounts participate
in delivery with two workers; seventeen exact messages are verified. First/median/maximum local
round trips are 210/213/274 ms. Unauthenticated submission/relay, sender impersonation, unknown local
recipients, wrong passwords and wrong TLS chain/hostname are rejected. The 1 MiB SMTP envelope
limit and atomic mailbox quota refusal pass. Restart and backup/verifydata/restore preserve all
seventeen messages, including configuration and TLS material.

Peak cgroup memory: 373,288,960 bytes (356 MiB). Mail logical bytes: 184,101,214; allocated bytes:
103,686,144. Total elapsed: 140.86 seconds. These include the fixture, not the Rails/PostgreSQL app,
and certify neither production throughput, disk growth, long-term stability nor 700 active users.
The seven planner tests and prepared-state checks were added after earlier exploratory runs;
only r7 is the final core acceptance record.

## Application adapter proof

`mail1017-app-r4` used a pinned Ruby dependency image and a separate real Mox fixture, sharing
the same network-disabled namespace. Canonical application MIME is submitted with verified
STARTTLS/AUTH, retrieved through the application's TlsImapTransport and compared for exact sender,
recipient, Message-ID, subject, Unicode body and UID cursor behavior.

Five compatibility tests / 18 assertions, six TLS IMAP tests / 34 assertions and six ImapSync
tests / 34 assertions pass without failures, errors or skips. Whole-server Steep passes. RuboCop
`--lint` passes for the two changed Ruby files; existing new-cop notices are not new offenses.
The regression fixes Mox rejecting quoted UID search strings; typed SequenceSet serialization
and the maximum UID boundary are covered. A prior type failure from inferred Numeric was fixed
with the exact integer maximum. Wrong password, wrong CA and held remote SMTP are negative controls.

This is protocol/adapter proof. The direct test SMTP client does not traverse application approval,
SQL authorization, worker receipts, durable import or the UI. No production profile was enabled.
Full backend/frontend results recorded in earlier checkpoints are historical and source-specific;
they are not relabelled as full-suite execution of this new source state.

## Cleanup and reproducibility

Both core and app cleanup returned zero. The dependency build cleanup returned zero. A subsequent
independent inspection verifies exact core/app/Ruby/BuildKit containers absent, dependency tag and
image ID absent, builder and its exact cache volume absent, synthetic credential file absent, and
only the default builder registered. Shared pinned base images and persistent data remain.

Core free bytes changed 227,748,466,688 to 222,698,536,960; app cleanup 253,460,332,544 to
253,526,831,104; build cleanup 255,213,076,480 to 255,262,892,032. Independent final free bytes:
255,228,768,256. These are shared-host deltas, not attributable reclaimed space. Windows Docker
was not used; virtual-disk compaction is not applicable to these Linux fleet operations.

Safe result JSON, source SHA-256 manifests, test logs and cleanup receipts are in `evidence/`.
No live credentials, password files, TLS private keys or message databases are included.

## Remaining implementation, in dependency order

1. MAIL1018/1019/1020a: held Mox composition, IMAP bounds and account/version/protocol-bound
   test credentials are complete within their source-specific gates. Production stays held.
2. MAIL1020b: atomic recipient budgets across organization/group/mailbox/sender domain/shared
   egress pool/destination domain, fixed lock ordering, unknown-attempt charge retention.
3. MAIL1021: bounded scheduling and exact-source approval/quota/SMTP/IMAP/inbox race acceptance.
4. MAIL1022: held native deployment proof, off-host encrypted restore, disk/queue alerts and
   remaining application/browser/native packaging and runtime acceptance.
5. Activation: hosting/IP/SMTP eligibility, owned domains, TLS/DKIM/DNS, scoped credentials and
   consenting provider canaries. Credentials alone and200 private seeds cannot establish reputation.
