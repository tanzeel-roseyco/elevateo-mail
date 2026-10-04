# Desktop agent and always-on campaigns

Status: historical discussion; architectural proposals are NOT approved standards. The current product master plan and backend blueprint supersede older scope, provider and volume assumptions in this file. Latest: ten separate users, Google personal inbox sync, Resend opted-in campaigns, 30/mailbox/day, earlier 600/user/day ceiling, hosting below A$15 subject to measured allowances.

Consolidated planning entry point: [product master plan](product-master-plan.md). It includes the user's preliminary screenshots and tracks unresolved conflicts explicitly; this file retains the earlier discussion and research context.

## Confirmed user requirements
- Installed Windows desktop application with its own window and taskbar icon.
- Personal email inbox plus advanced outreach campaign workflows; "more advanced than Instantly" requires a concrete feature list.
- Google Workspace incoming-mail notifications.
- AI chat using local Codex CLI primarily, Claude CLI as fallback.
- Agent can draft and send email and help operate outreach campaigns; approval policy remains unresolved.
- Sandboxed execution with low CPU and GPU usage is a priority. Meaning of "within the account" remains unresolved.
- Campaigns continue when the computer is off, with very low hosting cost.
- Earlier requirement: outreach recipients are consenting / opted in. Latest reference to cold outreach does not resolve consent details or provider policy eligibility.

## Proposed deployment boundary
Desktop: UI, notification/tray component, on-demand agent bridge and bounded local cache.
Hosted backend: durable campaign state, scheduled dispatch, consent/suppression checks, provider credentials, mailbox event ingestion, retries and reconciliation.
Local agent prepares plans and content; hosted deterministic workers execute authorized schedules without requiring an LLM for every send. New AI work while the PC is off requires a separate hosted AI path and budget.

## Proposed safeguards and resource controls
One active local agent; no local model inference; bounded context and output; cancel/timeouts; stop child processes on idle; event-driven notifications; bounded sync batches and history. Define measured CPU/RAM budgets on the user's hardware before acceptance. Normal UI rendering can still use the GPU.
Separate permission enforcement from resource limits: a sandbox does not cap CPU automatically. Restrict agent files and network; expose narrow email tools rather than raw mailbox credentials. Treat email content as untrusted input, not instructions. Approval is bound to the actual recipient/content/campaign version. Track action IDs so provider fallback cannot replay uncertain sends.
Codex supports native Windows sandboxing; Claude's documented built-in sandbox requires WSL2 on Windows. Do not silently fall back to unsandboxed execution. Benchmark on-demand WSL2 or another explicitly designed isolation approach before committing to fallback implementation; never shut down unrelated WSL workloads.

## Gmail notification design
Gmail watch -> Google Cloud Pub/Sub -> authenticated backend handler -> fetch mailbox changes -> persist/deduplicate -> notify connected desktop. Renew watches daily; add reconciliation for missing events and recovery for stale history. A powered-off PC cannot display notifications; it catches up later. Closing-window versus fully-exiting behavior is unresolved.

## Cost hypothesis
Target a small event-driven backend before buying additional campaign platforms or Redis. Cloudflare Workers is one candidate, with a published paid minimum of USD 5/month; this is NOT an all-in quote. Database, storage, backups, Google services, domains, mailboxes, AI subscriptions and optional third-party tools require separate accounting. PostgreSQL remains an earlier proposal, not a finalized choice. No hosting selection made.

## Questions for the next planning round
1. Monthly hosting ceiling in AUD, excluding already-paid mailbox and AI subscriptions?
2. Existing Codex/Claude plans, mailbox providers/count, expected total daily sends?
3. Three concrete capabilities that should exceed Instantly?
4. Sandboxed within Windows account or application account; should arbitrary shell tools be available?
5. Approve campaigns once then execute automatically; approval for individual AI replies?
6. Does AI need to generate new content while PC is off, or only execute approved prepared campaigns?
7. Hardware and acceptable background memory use; tray notifications when the window is closed?

## Sources checked
- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/windows/windows-sandbox
- https://code.claude.com/docs/en/sandboxing
- https://code.claude.com/docs/en/headless
- https://developers.google.com/workspace/gmail/api/guides/push
- https://developers.cloudflare.com/workers/platform/pricing/

## Workspace note
Concurrent frontend source and standards changes were observed during planning. This note does not approve, review, or alter that work. No application code was changed or tests run for this documentation-only update.


## Inbound routing clarification — 2026-10-04
Inbound receiving is required. The user supplied CTO messages reporting accidental root MX replacement on boltloop.co, flooda.co and elevateoco.com, followed by restoration to Google. This is reported incident context, not independently verified DNS or permission to change infrastructure.

Planning constraint: preserve company root MX records. Application runtime and AI agents should have no DNS-write credentials. Application-specific receiving must use a separately approved subdomain; in.elevateoco.com is reportedly already in use and must not be repointed without verifying ownership and existing consumers. MX priorities are failover preferences, not mailbox routing or mail duplication.

Two distinct flows must be resolved:
- Existing company mailbox mail remains at Google; display it through an authorized Gmail integration if personal-inbox scope remains required. No MX change is needed for API sync.
- Application-addressed inbound mail can go through Resend or an existing SES pipeline on an approved subdomain, then authenticated events, durable ingestion, deduplication, threading, and desktop notifications. Provider is unresolved for the existing subdomain.
A campaign Reply-To on the inbound subdomain directs normal replies there; it does not capture messages sent directly to a root-domain address.

The later repository decision of Resend-only/no Google conflicts with the earlier personal Google inbox requirement. Do not implement either interpretation until clarified. Resend remains the recorded sending choice; receiving architecture is reopened by this incident.

Acceptance criteria proposed: ordinary root mail still reaches Google; isolated app-addressed mail appears exactly once; replies attach to the right thread; notifications work; duplicate/retried events are safe; reception persists while the desktop is off. Verify provider receipt/storage configuration before any approved routing change. Delivered means recipient-server acceptance, not arrival in the intended user's inbox.

Incident recovery requires separate read-only investigation of receipt rules, storage and logs; neither loss nor recovery is established by the pasted messages alone. No DNS, AWS, Cloudflare, or API-key changes were made for this planning update.

The quoted USD 10/month OpenAI project budget is reported context, not verified enforcement or authorization to create a key. Hosted AI costs and local CLI subscription use remain separate planning items.

References: https://developers.google.com/workspace/gmail/api/guides/sync ; https://docs.aws.amazon.com/ses/latest/dg/receiving-email-setting-up.html ; https://github.com/resend/resend-skills/blob/main/skills/resend/references/receiving.md
