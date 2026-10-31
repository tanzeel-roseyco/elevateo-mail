# Operations, limits and troubleshooting

Jeison and Tanzeel share maintenance. Callum decides updates and approves operational changes through the [handoff gates](README.md). Use the accepted release's [production procedure](production.md); old fleet runbooks and research notes are not authorization.

## Safety and routine checks

Outbound defaults to held. Compose forces the hold even in optional Resend mode. Provisioning defaults off; enabling it requires approved assignments. Mailbox/user daily ceilings default to 30/300 and can be lowered. The user ceiling is shared across mailboxes/organizations; provisioning does not reset usage. Destination domains need explicit policy; absence fails closed. Warm-up and provider test mail count as live sends and require approval.

Finder probing has separate limits: 50/day globally, at least 60 seconds between probes to a destination MX, at most three guesses per person; 4xx responses pause that host for an hour and reputation signals pause globally for 24 hours. Discovery is spaced by at least 10 seconds with jitter and pauses for six hours on rate limiting; results cache for 30 days. SMTP probing sends no DATA. A discovered or verified address is not consent. Sources: [finder documentation](../email-finder.md) and its linked implementation.

Inspect service health with `docker compose -p elevateo-production -f ops/production/compose.yaml ps` (include the Resend overlay when selected). Review redacted errors, queue age, unknown sends, inbound lag, auth failures, disk use and backup age. Thresholds, notification destinations, on-call rota and retention are TO CONFIRM with Callum. Do not log tokens, message bodies or populated Compose configurations as diagnostics.

## Troubleshooting by symptom

Only source-documented failure modes are included. Check the linked implementation before changing state.

| Symptom | Likely cause | Check | Fix / safety boundary |
| --- | --- | --- | --- |
| Deployment rejects inputs before starting | Missing/invalid credentials, mutable image reference, nonabsolute lock/CSV, invalid TLS | Rerun `sh ops/production/deploy.sh --dry-run`; inspect redacted validation errors in [deployment](../../ops/production/deployment.py) | Correct the named input in secret management. Do not bypass validation or print secrets. |
| `deploy.sh config --quiet` fails | Old finder harness invokes a nonexistent command | [deploy shell](../../ops/production/deploy.sh), [finder harness](../../ops/tests/email-finder/check.ps1) | Use `--dry-run` with complete validated inputs. Repair the harness as a separate reviewed code change. |
| Existing database rejects a changed password | Environment change is not SQL role rotation | [role bootstrap](../../ops/supabase/db/98-service-identities.sql), existing role state through approved DB access | Coordinate role-password rotation and dependent services; do not recreate the data volume. |
| Attachment setup rejects the bucket | Existing bucket is public or configuration invalid | [storage configuration](../../ops/production/configure_storage.py) | Correct privacy/settings through an approved change. Never make private mail attachments public to clear the error. |
| Mox initializer refuses existing files, possibly leaving Mox stopped | Bootstrap deploy stops Mox before checking changed owned config/TLS volumes | [initializer](../../ops/production/completion/initialize_mox.py), [deployment](../../ops/production/deployment.py) | Preserve data; review a migration/rotation and service recovery procedure. The initializer is not a live configuration overwriter. |
| Mox healthy but real login/delivery unavailable | Readiness checks protocol/TLS, while accounts remain disabled | [readiness](../../ops/production/mox_readiness.py), initializer and [mail history](mail-server-development.md) | Complete approved account/credential/application wiring and DNS activation; no automatic enable or test send. |
| Tenant initialization refuses a fresh deployment | Gate target assumptions, missing verified identity/subject or company-domain restriction | [initializer guide](../../ops/production/initialize/README.md), `admission.py` and `tenant.sql` there | Reconcile the target and approved identity flow with Tanzeel; do not bypass the gate or enroll by email lookup. |
| Finder SMTP verification unavailable | Empty public-IP setting, PTR mismatch or port 25 blocked | Finder health reason and [finder config](../../apps/server/lib/elevateo/email_finder/config.rb) | Confirm the approved separate IP/routing/PTR/provider policy. Leave probing unavailable until fixed. |
| Finder work pauses after remote failures | Host/global reputation or rate-limit pause | Finder health/status and [finder documentation](../email-finder.md) | Respect the cooldown and inspect cause; do not reset counters or rotate IPs to evade it. |
| Native login cannot exchange its authorization result | Client expects an absent native-session route | [contract reconciliation](../contract-requests.md), [server routes](../../apps/server/config/routes.rb) | Implement/review the agreed contract and retest all clients before release. |
| Android signed artifact still identifies as QA | Build script explicitly selects isolated QA origin/profile | [APK build script](../../apps/android/build/build-apk.sh) | Keep it internal; complete a reviewed production build recipe. Signing alone is insufficient. |
| Send outcome is unknown after timeout/crash | Remote acceptance may have happened before acknowledgement | [recovery operations](../../ops/production/completion/README.md), [send worker](../../apps/server/lib/elevateo/send_worker/) | Hold and reconcile; never blindly retry or promise exactly-once delivery. |
| Restore rejects a target | Existing state, wrong image/revision, unsafe mounts/networking/ports | [recovery](../../ops/production/completion/recovery.py) validation | Prepare a fresh isolated target. Do not weaken admission checks or restore over live volumes. |

## Known limits and remaining work

The complete merged release has not passed all gates; branch evidence is scoped in the [summary](README.md). Company infrastructure, live auth, mail activation/delivery, off-host backup and public clients remain unverified. Production Compose provides no public web edge, no distinct finder routing, and no proven fresh-host tenant-enrollment procedure compatible with its current project/service names. Native exchange/bridge and Android production packaging need completion. Existing uncommitted Windows changes and schema/modular branches must be reconciled first.

RPO/RTO, capacity, monitoring thresholds, retention/data residency and incident ownership are decisions, not measured guarantees. The consolidated [TO CONFIRM list](README.md#to-confirm-before-company-rollout) names decision owners. See the current [incident](../runbooks/incident-response.md), [recovery](../runbooks/disaster-recovery.md) and [stolen-laptop](../runbooks/stolen-laptop.md) runbooks for bounded response procedures.
