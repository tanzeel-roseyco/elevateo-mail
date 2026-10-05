# Credential-free HTTP integration validation

Scope: backend first journey on `feature/backend-foundation`, based on reviewed commit `49fc23e`. Synthetic HTTP requests cross a real socket into the bundled Worker, local persisted D1 and the durable fake provider. No external email, credentials, DNS changes, deployment or push. The Fable frontend worktree is unchanged; its gateway wiring and application visual QA remain separate work.

## Reproduction

Use [Docker fixture instructions](../integration-fixtures.md) and [integration v1](../contracts/integration-v1.md). The dedicated backend image avoids the frontend Playwright build. All application checks run inside Docker. Worker bundling uses `wrangler deploy --dry-run`, never deployment.

## Behavioral coverage

- HTTP create, exact-content approval, queue consumption, durable fake acceptance, inspect and storage reload.
- Duplicate create keys, changed-content conflict, lost successful approval response and safe inspection.
- Two-owner isolation, short-lived session expiry/revocation and absent public session minting.
- Concurrent twenty-recipient approvals at the thirty-recipient mailbox boundary; one reservation succeeds.
- Permissions, suppression, database/config pause, cancellation and quota release before dispatch.
- Approval immediately after a scheduler tick with the minimum sixty-second TTL; immediate enqueue removes the previous five-minute relay dependency.
- Receipt persisted before Worker crash, scheduled recovery while paused, positive reconciliation without another send; unresolved outcomes stay reserved and stop automatic checks after ten attempts.
- Persisted invalid JSON and valid-shaped content corruption fail before provider invocation, with redacted diagnostic codes and correlation IDs.
- Ten active mailbox slots, replacement/reconnect preserving historical owner charges and the three-hundred-recipient owner ceiling.
- Atomic offline migration/marker rollback and concurrent mailbox identity inserts preserving requested permissions.

## Bounds and measurement

Queue work: ten messages per batch, three configured retries. Relay: one hundred due jobs, one hundred stale claims and one hundred expired approvals per tick. Unknown reconciliation: twenty rows per tick, five-minute unsuccessful-check spacing and ten automatic checks per intent. Absence of a receipt never authorises a resend or releases an uncertain reservation.

Representative D1 prepared-statement counts, including session authentication: capabilities two, mailbox inventory two, quota three, paginated summaries two. Query-plan inspection requires the owner-quota index for accepted usage. These are statement counts, **not** billed `rows_read`, trigger-operation totals or cloud load measurements. Indexed quota reads exclude old accepted history; active held and recent accepted charges are bounded by admission policy. No hosting-price guarantee follows from these measurements.

## Review and limitations

See [code reviews](../../code-reviews.md) for the full rubric, source slices, six corrected source defects and exposure-based defect density. Local design simulations cover replacement quotas, unknown reservations and reconciliation budgets. No Obsidian connection was available; no Obsidian simulation is claimed.

The rolling twenty-four-hour recipient policy is provisional. Fake acceptance proves persistence and recovery, not delivery or real-provider behavior. Production authentication/OAuth, inbox synchronization, history import, campaign product integration, AI bridge grants, independent restore rehearsal and cloud queue/load behavior remain open. Existing experimental foundation routes are outside integration v1. Credentials-last gates are in fixture instructions.

## Execution and Docker cleanup

Final Docker execution passed generated Wrangler types, ESLint, strict TypeScript, dry-run Worker bundling and **38 tests**, with zero failures, skips or cancellations (56.54 seconds). Bundle size: 808.40 KiB, gzip 128.75 KiB. The separate HTTP demo passed: accepted usage 1, held reservations 0, mailbox remaining 29 and owner remaining 299. No real provider was invoked.

Checks and demo ran with `--network none`; Docker-internal HTTP and local D1 remained available. Network isolation also avoided a Wrangler tooling connection hanging after type generation. The first isolated check exposed strict TypeScript narrowing issues in the AI permission guard, HTTP test tuple and test-only approval TTL bindings; all were corrected and reviewed before the final clean run.

Dependency download recovery used a temporary Dockerfile with the canonical build stages plus a task-owned npm cache. The pinned official workerd package was downloaded in chunks inside Docker and checked against the lockfile SHA-512 integrity before caching. Remaining packages used the lockfile through `npm ci --prefer-offline`; no dependency versions or production Dockerfile were changed. Backend install audited 43 packages with zero vulnerabilities; this does not supersede the frontend's documented development-tool advisory.

Immediately after verification, all task containers were gone and the task check/cache images and task-downloaded Node base tags were removed. Only the 20 verified task-created build-cache records were pruned: Docker reported **1.204 GB** reclaimed. Final Docker usage: zero images, containers or build-cache records; two pre-existing persistent volumes retained at 67.16 MB (`nerz-local-review_nerz_data`, `nerz-local-review_nerz_pgdata`). Temporary task Dockerfile/download helper were removed; source, original CLI artifacts, credentials and persistent data were preserved.

Host C: free space was 21,877,542,912 bytes before cleanup and 21,871,812,608 afterward; logical Docker reclamation did not increase host free space. Supported WSL `fstrim` on the Docker data mount reported 0 bytes trimmed. Offline virtual-disk compaction was not attempted because it requires Docker/WSL shutdown and potentially privileges, which could disrupt concurrent work. No virtual disk or volume was deleted. Deleted images and caches must be rebuilt/downloaded for the next run.
