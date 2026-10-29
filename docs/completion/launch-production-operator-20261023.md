# Production operator evidence — 2026-10-23

Task `task_0aa04eec66b0`, dispatch `ctx_d78cbb182a94`. **Real current-state backup and isolated restore comparison PASS; coordinator acceptance remains pending. No production schema apply.** This is operator evidence, not an independent reviewer approval or release authorization.

## Actual target and capture

Read the existing-infrastructure discovery, initializer README/scripts, README, state, documentation and standards before execution. Existing SSH access worked without sudo; no sudo password was requested, supplied or bypassed. All restore execution used fleet-02 Docker under `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock` with `flock`.

Verified production containers and dedicated volumes:

| Resource | Actual identity |
| --- | --- |
| Database | `elevateo-mail-live-db-1`, database `postgres` |
| PostgreSQL image | `sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00` |
| Database data | `elevateo-mail-live_db-data` → `/var/lib/postgresql/data` |
| Database configuration | `elevateo-mail-live_db-config` → `/etc/postgresql-custom` |
| Storage | `elevateo-mail-live-storage-1` |
| Storage content | `elevateo-mail-live_storage-data` → `/var/lib/storage` |

The live private network contained only its DB, Auth, REST, Storage and Mailpit services. Stopped only the running live Auth/REST/Storage containers for capture; verified **zero other client sessions** before taking snapshots. The database remained running. No application or mail worker was attached to that network. Mailpit and all unrelated workloads remained running. Before/after row and catalog comparisons passed. The three stopped services were restarted to their original running state immediately after capture; subsequent Auth/Storage/database health checks were healthy and REST was running.

Capture interval: **02:24:55–02:24:59 UTC**. The DB was approximately 10.24 MB. `pg_dump -Fc` captured the complete database, `pg_dumpall --globals-only` captured roles/global grants, and a read-only mount of the exact Storage container volume produced a recoverable tar plus per-file SHA-256 manifest. No backup contents or credential values were printed.

## Protected artifacts and hashes

Private retained directory on **fleet-02**: `/home/tanzeel/launch-production-operator-20261023`, owned by tanzeel, mode `0700`; backups/evidence mode `0600`, operator scripts `0700`. Backups contain sensitive production material and remain outside Git. Total retained staging was 509,277 bytes at the independent final probe.

| Artifact, relative to that directory | SHA-256 |
| --- | --- |
| `database.dump` | `d8c3b759d1327ae56ecea0b2fda662aba8a90b1ecba3669a09ad397f1e78c056` |
| `globals.sql` | `38950e2bcbcbe66e660b0019ebefa133adf59486d44ccad76ba6618fd7118266` |
| `storage.tar` | `27c52fd93d28c7809b25d23231f5f2c886e87ada6cdd38cdc2e58b6f78a2eec6` |
| `storage-manifest.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `restore-acl-supplement.sql` | `07905730274f642c9041a588392b648d3b337e758f99704b5a751fdc7697eea9` |
| Both before/restored whole-table row summaries | `fa84c9fb0082270e3a7e312a88fce5144a52d0c8077467baa72edc8978e640fb` |
| Both normalized ownership/grant/RLS catalogs | `8fa624a5e674876494e0e33df9b41d12c7c7050df49d8521fb18dacfb536667a` |
| Both normalized DB owner/ACL/locale/settings records | `a5bfbac6ee059db95aed2d49659fdb6f2c0840faa97d4545dab7388dac95b48b` |

`evidence.sha256` lists exact files, including distinct raw catalog hashes. Raw catalog ACL arrays can reorder during restoration; normalization sorts array entries before comparison and does not discard permissions, grant options, owners or settings. Row summaries cover **34 tables**, using table counts and ordered whole-row JSON MD5 summaries. These are equality checks, not cryptographic authentication of individual rows; the backup itself is bound by SHA-256. The catalog contains **318 records** covering schema/relation/function ownership and ACLs, RLS enabled/forced flags, policy expressions, default privileges, role attributes and role memberships.

## Isolated restoration and independently repeated checks

Final restore completed **02:30:15 UTC**, exit zero. Used the exact production PostgreSQL image, an internal Docker network `prodrestore20261023-net`, no published ports, no production network, and tmpfs for PostgreSQL data and restored Storage content. No Auth/Storage API, provider integration, mail route or application worker was started. The production global role backup includes sensitive authentication material; it stayed inside the protected staging and disposable database. The container received only a disposable bootstrap password through its environment.

Recovery sequence, implemented in protected `restore.sh`:

1. Before repeating the script, independently verify that the task container/network names are absent. The script acquires the shared fleet Docker lock.
2. Start `prodrestore20261023-db` with the pinned image and tmpfs on the task internal network. Wait for TCP readiness, which excludes the image's temporary initialization socket server.
3. Restore global ALTER/grant statements; retain CREATE ROLE statements only for roles missing from the same-version baseline. The original `globals.sql` remains unchanged; `globals-restore.sql` records the filtered derivative.
4. Create separate `restore_acceptance` from `template0`. Restore the full custom archive there with `pg_restore --exit-on-error`; do not clean/drop the image's existing `postgres` database.
5. Replay the source-derived `restore-acl-supplement.sql` **only on the isolated target**. This preserves extension-owned GraphQL schema grants and the original database owner, ACL and database-scoped settings despite the acceptance database's different name.
6. Compare all table row summaries, normalized ownership/grant/RLS catalogs and database metadata. Extract `storage.tar` into isolated tmpfs and compare its content manifest exactly.
7. Record isolation, hashes and counts. Inspect mounts, remove only the task container and network, and verify their absence.

At **02:30:45 UTC**, a separate verification command reacquired the shared lock, rehashed every entry in `evidence.sha256`, repeated every equality comparison, verified exit zero, independently checked the source catalog was still byte-for-byte unchanged, checked live service health, and confirmed no task-labelled containers or networks remained. This is a separate operator verification, **not a second person's independent acceptance**.

Actual recovered counts: **Auth users 0; Auth identities 0; Storage objects 0; Storage buckets 0**. Storage had no regular files; the empty manifest hash is intentional and the tar was still extracted and checked. No application tenant data was present to exercise recovery. This is the real existing stack's empty state, not a seeded or simulated replacement. It cannot establish populated user/upload/tenant recovery or genuine Google-identity tenant rehearsal.

## Failures retained and corrected in isolated staging

Earlier attempts did not pass and are not acceptance evidence. A direct clean restore into the image's baseline database hit `pg_graphql` extension ownership; database recreation then encountered background connections. An additional attempt observed exit 137 during baseline database reset; its cause was not independently established. A premature socket-readiness attempt lost the server socket during image initialization. No production reset was attempted. The final approach waits for TCP and uses a separate empty database.

Catalog comparison then caught missing grants on extension-owned `graphql` and `graphql_public` schemas. A database metadata comparison separately caught the missing `app.settings.jwt_exp=3600` setting. The protected supplement captures those real source settings/grants plus database ownership/ACL; final comparisons include them. ACL entry order alone was normalized; real omissions were repaired rather than ignored. Private failure logs are retained alongside successful receipts.

## Existing storage inventory; no capacity changes

| SSH target | Existing disk/mount evidence | Available at probe |
| --- | --- | --- |
| fleet-02 | Two 476.9 GiB NVMe devices already partitioned into RAID swap/boot/root; ext4 `/dev/md2` root 437 GiB. No unused data mount observed. | 65 GiB; final exact available **68,913,770,496 bytes** |
| hetzner-platform | 160 GiB virtual disk; ext4 root 154 GiB, boot/EFI partitions; tiny cloud-init ISO device. No additional data disk observed. | 56 GiB |
| hetzner-ci | 76.3 GiB virtual disk; ext4 root 75 GiB, EFI; loop-mounted installed applications. No additional data disk observed. | 17 GiB |

**120 × 2 GB = 240 GB decimal (or 240 GiB if that is the intended unit). No probed host has enough currently free storage for full quota use, and even their approximate combined free space is below 240 GB decimal.** These shared roots are snapshots, not reservations or usable pooled storage. RAID members and existing application disks are not spare capacity. No purchase, deletion, resizing, quota enforcement, mounting or shared configuration change was performed.

## Acceptance boundary and cleanup

Coordinator must review the private operator scripts, source-derived supplement and receipts before accepting this evidence. No protected gate JSON was created and no initializer schema/tenant apply was run. Exact accepted operator-image provisioning and initializer rehearsal on an actual-data restore remain separate gates; the historical synthetic 43-migration rehearsal does not establish them here. An existing confirmed Auth identity and approved tenant values are absent. Local retained backups are not an encrypted off-host backup strategy; encryption/off-host retention and recovery-key custody remain unresolved production gates.

Google Cloud operations were expressly revoked by the coordinator during this task; none were attempted. No identity/provider changes were made, and no replacement identity provider was selected. Existing self-hosted GoTrue is the available identity service; configuring another SSO mechanism requires separate product/security approval and compatibility work. Google Workspace, DNS, Cloudflare proxy settings, outbound sending and warmup holds remain unchanged.

Each attempt cleaned only `prodrestore20261023-db` and `prodrestore20261023-net`. Mount inspection showed no persistent mounts, only the two task tmpfs paths. No images, build cache or named volumes were created or removed; the pre-existing pinned image and all production/shared data were retained. Disposable tmpfs space was released on container removal; its exact byte count was not measured. No local Docker/WSL resources were used, so Windows disk compaction was inapplicable. Production backups and receipts were deliberately retained. No source edits, commits, purchases, production schema writes, DNS changes, live sends or warmup were performed; only this report and private remote staging were added.
