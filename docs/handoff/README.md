# Elevateo Mail engineering handoff

This guide is for Jeison, starting with no project context. Tanzeel did the bulk of development. Jeison implements the company setup; Jeison and Tanzeel share upkeep and maintenance. Callum decides which updates happen, reviews the evidence, and approves deployment and outward-facing actions.

Read this page, [local setup and verification](verification.md), [production setup](production.md), [environment inventory](environment.md), [client releases](clients.md), and [operations](operations.md), in that order. [Mail-server development](mail-server-development.md) explains the implementation history. The separate [product guide](../product/README.md) covers product use; it may arrive through the product-documentation branch.

## What exists, and what has actually passed

The repository contains a React web client, Ruby/Rails API and worker, PostgreSQL with self-hosted Supabase auth/storage, Authentik SSO integration, Mox integration, private attachment gateway, mailbox MCP, email finder, and macOS, Windows, Android and iOS client implementations. Contracts in [v1](../../contracts/v1/) and [v2](../../contracts/v2/) define the API. Implementation is not a release certificate.

| Area | Evidence and limit |
| --- | --- |
| Backend branch | [30 October receipt](../completion/backend-20261030-receipt.md): 1,285 tests / 14,595 assertions, Steep and RuboCop; 46 migrations and 28 tests / 202 assertions across eight database suites; 50 Node and 19 Ruby contract tests; 11 MCP, 62 operations, 8 Rust and 15 Python native-bridge tests. These are branch-specific results, not a rerun of this checkout. |
| Mail and recovery | Same receipt: Mox protocol 4 tests / 412 assertions; real local SMTP → IMAP application chain 1 test / 88 assertions; encrypted six-volume restore drill and deployment dry runs. This proves isolated behavior, not public delivery or off-host SFTP. |
| Finder | [29 October receipt](../completion/email-finder-20261029.md): 53 backend tests, 12 finder browser cases and 1,131 web unit tests. It also records 33 other browser failures and two contract-check failures without a clean baseline. |
| Clients and merged product | [Root state](../../state.md) records the final integrated build/test/packaging pass and desktop/mobile light/dark visual QA as pending. Review packets P24–P34 remain unrun; the native Cargo lockfile needs regeneration and review. [Earlier frontend evidence](../completion/frontend-refinement-20261024.md) does not close those gates. |
| Production | No production deployment, live SSO, public deliverability, first live send, off-host backup verification or public client release is certified by this handoff. The shipped Compose assembly holds sending and initializes disabled Mox accounts. |

The documentation audit starts from commit `29d7c99c`. At inspection, `feature/final-readiness` had uncommitted Windows work in another worktree. It is not part of this checkout and must not be assumed included. `tanzeel-roseyco/bugfix-schema-integrity` and `tanzeel-roseyco/feature-modular-boundaries` are in progress. Jeison and Tanzeel must reconcile the accepted commits before Callum approves a release SHA. Rerun affected checks after integration, especially database migrations, native login and Windows packaging.

## Access, equipment and tools

| Need | Why | Grantor / decision owner |
| --- | --- | --- |
| Repository read access and approved release checkout | Source, contracts, scripts and receipts | Tanzeel coordinates; repository administrator is TO CONFIRM |
| Docker Desktop Linux engine, Git, POSIX shell and Python 3.12+ | Local containers and host-side orchestration | Jeison installs; company endpoint policy owner is TO CONFIRM |
| Linux production host, persistent disk, static public IPv4, firewall and SSH access | Mox uses host networking; private database/object volumes must survive upgrades | Provider, sizing and infrastructure administrator are TO CONFIRM with Callum |
| Private image registry and secret manager | Immutable release images and runtime-only credentials | Company administrators TO CONFIRM with Callum |
| Authentik administration and approved group | OIDC application, directory lookup and membership authority | Existing Authentik platform administrator; named owner TO CONFIRM with Tanzeel |
| Domain registrar/DNS authority, TLS issuance and PTR control | Mail identity, HTTPS and reverse DNS | Domain/provider owners TO CONFIRM; Callum approves each change |
| Separate finder public egress IP with port 25 | Reputation separation and SMTP verification | Network administrator TO CONFIRM with Callum |
| SFTP backup destination and offline recovery-key custodian | Encrypted off-host backup and disaster recovery | Storage/security owners TO CONFIRM with Callum |
| macOS host with Xcode and Apple developer access | macOS signing/notarization and iOS build/signing | Apple account owner TO CONFIRM; Jeison handles builds |
| Windows test machine and signing identity; Linux KVM host for Android | Real client QA, installer signing and emulator acceptance | Company device/signing owners TO CONFIRM |
| Optional Resend account | Only if Callum chooses the implemented optional transport | Account owner TO CONFIRM; not required for held setup |

No supported minimum production CPU, memory, disk size or capacity result is established. Size from measured workload and restore duration before rollout. Android emulator instructions require KVM; Docker Desktop alone does not establish that availability.

**fleet-01 is read-only and off limits. Do not access it.** This handoff grants no permission for any fleet host, Cloudflare or Google Cloud. Historical fleet commands are not setup instructions. Use `DOCKER_CONTEXT=desktop-linux` for local Docker work; the default `fleet02` context is broken.

## Callum's approval record

Jeison prepares evidence; Tanzeel helps resolve implementation questions. A blank sign-off is a closed gate. Approval of one row does not approve another. Nothing past a gate proceeds until Callum signs that specific action, scope and release SHA. Provider console work needs the same approval as a command.

| Gate | Evidence Jeison must show | Callum sign-off |
| --- | --- | --- |
| Purchase/provision production host, IPs or paid services | Provider, costs, location, access owner, sizing and network plan | Name/date/reference: ______ |
| Change Authentik application, group or enrollment authority | Redirects, group UUID, least-privilege scopes, denied-user test and revocation test | Name/date/reference: ______ |
| First production deploy or later production update | Accepted SHA/digests, all verification results, backup/restore evidence, maintenance window and rollback plan | Name/date/reference: ______ |
| Tenant/mailbox provisioning and granting access | Verified Authentik subject, approved assignment CSV digest, roles, dry-run output and hold evidence | Name/date/reference: ______ |
| Publish web/API/auth/MCP edge routes or widen firewall | TLS and route map, allowed callbacks, private-service isolation, spoof-header and authorization tests | Name/date/reference: ______ |
| Issue/replace live TLS certificates or publish DKIM/SPF/DMARC/PTR | Key custody, exact records, validation and previous-record rollback plan | Name/date/reference: ______ |
| Change DNS or MX | Exact zone diff, TTL/propagation plan, old mailbox retention, inbound test plan and rollback records | Name/date/reference: ______ |
| Activate Mox accounts or outbound delivery | Reviewed activation procedure, credentials, quotas, suppression and ambiguous-send recovery tests | Name/date/reference: ______ |
| Configure Resend domain/webhook or enable transport | Provider authorization, domain records, webhook verification and hold evidence | Name/date/reference: ______ |
| Enable finder public probing | Separate observed egress IP, PTR/port-25 checks, rate/pause policy and approved use | Name/date/reference: ______ |
| First live send, including test mail or warm-up | Named sender/recipient, permission, bounded count, limits, monitoring and abort plan | Name/date/reference: ______ |
| Upload backups to company/off-host storage | Destination ownership, encryption, pinned SSH host key, retention and restore-key custody | Name/date/reference: ______ |
| Production restore/cutover or destructive migration | Isolated drill, RPO/RTO, reconciliation of sends, exact data impact and recovery plan | Name/date/reference: ______ |
| External signing/notarization/store upload and public client release | Platform-specific signed artifacts/hashes, real-device QA, privacy/update policy and previous release | Name/date/reference: ______ |

## Maintenance and updates

Jeison and Tanzeel triage symptoms together and propose a scoped change with risk, test coverage and rollback. Callum decides whether it proceeds. Implement approved work on a feature/bugfix branch from the accepted main revision. Review changed behavior and its dependent contracts, docs and clients; use adversarial review plus a design review as required by [AGENTS](../../AGENTS.md). Run the relevant Docker checks and actual client visual QA. Record defects, evidence and limitations. Callum reviews the release diff and signs the affected gates above before deployment or publication. Keep README current state, state.md and documentation.md in the same change.

## TO CONFIRM before company rollout

These are unanswered decisions, not implied defaults. Jeison records answers and Callum approves the operational scope.

1. **Tanzeel + Jeison:** accepted release SHA; incorporation of uncommitted Windows, schema-integrity and modular-boundary work; final review packets and Cargo.lock status.
2. **Callum + company infrastructure administrator:** hosting provider, hostnames, capacity, region, firewall/edge topology, SSH owner and image registry. Compose contains a specific company origin; changing domains requires a reviewed configuration change.
3. **Tanzeel + identity administrator:** Authentik account owner, application, group, approved users/subjects and the organization-enrollment procedure for the company's domain.
4. **Callum + DNS/mail administrator:** domains, existing mailbox ownership, PTR authority, TLS issuer/renewal, DKIM/SPF/DMARC/MX records, migration timing and Mox activation/password procedure.
5. **Callum + Jeison:** outbound transport choice, destination-domain budgets, first-send recipients, permitted usage and limit changes. Current default is held, not permission to send.
6. **Callum + network administrator:** a distinct finder public IP and actual routing/SNAT implementation; the environment variable alone does not isolate egress.
7. **Callum + storage/security administrator:** SFTP host/account, key custodians, retention, RPO/RTO, backup window and monitoring/on-call ownership. **Jeison + Tanzeel:** tested full-production isolated restore definition preserving the exact service roster.
8. **Callum + client account owners:** Apple/Windows/Android signing accounts, distribution channels, updater origin, supported OS versions and privacy policy.
9. **Jeison + Tanzeel:** native session-exchange endpoint/bridge readiness, Android production packaging, real-device acceptance and final merged UI behavior.
10. **Callum + Jeison:** static web/HTTPS edge deployment mechanism, auth/MCP exposure, certificate automation, and an executable rollback for that chosen infrastructure. **Jeison + Tanzeel:** safe update/rotation procedure after Mox activation; bootstrap deploy is not that procedure.
11. **Repository administrator + Tanzeel:** named access grantors and integration of the separate product guide.

The [audit record](../completion/handoff-20261101/audit.md) distinguishes source checks from execution. This handoff does not claim any TO CONFIRM item has been approved.
