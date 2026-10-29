# Documentation index

Start with the root [README](../README.md), then the documents for your area. Documents marked *(historical)*
describe earlier stages. They are kept for context and do not describe the current system.

## Product and scope

| Document | What it covers |
| --- | --- |
| [end-goal.md](end-goal.md) | The finished product, daily workflow and completion criteria |
| [goals-and-traceability.md](goals-and-traceability.md) | Requirements traced to implementation |
| [decisions/](decisions/) | Architecture decision records (mailbox ownership, local architecture) |
| [business/financial-planning/](business/financial-planning/) | Cost model, pilot, growth and enterprise-readiness scenarios |

## Architecture and contracts

| Document | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | System architecture and component responsibilities |
| [backend-completion-design.md](backend-completion-design.md) | Final backend design: SSO, Resend, Mox, MCP, native bridge, deployment |
| [backend-database-tutorial.md](backend-database-tutorial.md) | Database and backend walkthrough for a shared company mailbox |
| [contracts-and-reliability.md](contracts-and-reliability.md) | API contracts, idempotency and failure recovery |
| [contract-requests.md](contract-requests.md) | Contract changes requested by the client lanes and their status |
| [desktop-and-connectors.md](desktop-and-connectors.md) | Desktop clients, assistant panel and the Claude/Codex MCP connector |
| [email-finder.md](email-finder.md) | Email finder module: tools, limits, PTR and port-25 setup |

## Mail delivery and the self-hosted mail server

| Document | What it covers |
| --- | --- |
| [mail-delivery-and-hosting.md](mail-delivery-and-hosting.md) | Delivery strategy, inbox setup and hosting |
| [mailserver/](mailserver/) | Mox mail-server design: SMTP binding, IMAP polling and recovery, MIME ingestion, attachments, send budgets, readiness |
| [mailserver-rd-roster.md](mailserver-rd-roster.md) | Mail-server R&D reference |
| [history/mailserver-rd/](history/mailserver-rd/) | Mail-server R&D team notes and coordination records (14 Oct 2026) |
| [operations/email-warmup-strategy.md](operations/email-warmup-strategy.md) | Warm-up strategy (warm-up is currently disabled) |

## Operations

| Document | What it covers |
| --- | --- |
| [credentials-last.md](credentials-last.md) | Ordered checklist of every credential needed to deploy |
| [../ops/production/README.md](../ops/production/README.md) | Production Compose assembly and `deploy.sh` |
| [production-readiness-plan.md](production-readiness-plan.md) | Production readiness checklist |
| [operations/supabase.md](operations/supabase.md) | Self-hosted Supabase operation |
| [runbooks/](runbooks/) | Disaster recovery, incident response, stolen-laptop procedure |

## Verification evidence

| Location | What it holds |
| --- | --- |
| [completion/](completion/) | Verification receipts per milestone. Latest: [backend-20261030-receipt.md](completion/backend-20261030-receipt.md), [email-finder-20261029.md](completion/email-finder-20261029.md), [frontend-refinement-20261024.md](completion/frontend-refinement-20261024.md) |
| [evidence/](evidence/) | Raw run logs and review evidence |
| [../code-reviews.md](../code-reviews.md) | Every adversarial review with defect counts and density |

## Plans *(historical)*

[implementation-plan.md](implementation-plan.md), [launch-blockers-plan.md](launch-blockers-plan.md),
[local-completion-plan.md](local-completion-plan.md), [component-adoption.md](component-adoption.md),
[repository-reuse.md](repository-reuse.md), [research/](research/), [design/](design/), [integration/](integration/),
[perf-01/](perf-01/), [reference-repositories/](reference-repositories/), [large-files.md](large-files.md).

## History

[history/README.md](history/README.md) explains how the repository was consolidated and where every earlier
repository, branch and folder went.
