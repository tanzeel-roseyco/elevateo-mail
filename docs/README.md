# Documentation index

Start with the root [README](../README.md), then the documents for your area. Documents marked *(historical)*
describe earlier stages. They are kept for context and do not describe the current system.

Jeison starts with the [engineering handoff](handoff/README.md), including setup, release gates, maintenance and
[mail-server development](handoff/mail-server-development.md). Product use belongs in the separate
[product guide](product/README.md), being integrated from its own documentation branch. The
[2026-11-01 audit](completion/handoff-20261101/audit.md) records each current-index document checked and its disposition.

## Product and scope

| Document | What it covers |
| --- | --- |
| [end-goal.md](end-goal.md) | *(Historical)* Product target and earlier completion criteria, not current release status |
| [goals-and-traceability.md](goals-and-traceability.md) | *(Historical)* Earlier requirements traceability |
| [decisions/](decisions/) | *(Historical)* Mailbox ownership/local architecture decisions; TypeScript backend, WPF and Java proposals are superseded |
| [business/financial-planning/](business/financial-planning/) | *(Historical)* Cost scenarios and CSV assumptions, not current prices or approved infrastructure |

## Architecture and contracts

| Document | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | *(Historical)* Earlier architecture; current assembly is in the handoff and production Compose |
| [backend-completion-design.md](backend-completion-design.md) | Final backend design: SSO, Resend, Mox, MCP, native bridge, deployment |
| [backend-database-tutorial.md](backend-database-tutorial.md) | *(Historical)* Earlier database walkthrough, not a fresh-host setup recipe |
| [contracts-and-reliability.md](contracts-and-reliability.md) | *(Historical)* Earlier contract/reliability design; contracts and implementation govern current behavior |
| [contract-requests.md](contract-requests.md) | Contract changes requested by the client lanes and their status |
| [desktop-and-connectors.md](desktop-and-connectors.md) | *(Historical)* Earlier desktop/connector proposals; implementations now exist, with release gaps in the handoff |
| [email-finder.md](email-finder.md) | Email finder module: tools, limits, PTR and port-25 setup |

## Mail delivery and the self-hosted mail server

| Document | What it covers |
| --- | --- |
| [mail-delivery-and-hosting.md](mail-delivery-and-hosting.md) | *(Historical)* Resend-first decision, superseded by Mox integration and optional Resend |
| [mailserver/](mailserver/) | *(Historical snapshots)* Source-specific SMTP/IMAP/MIME/attachment/budget designs and test receipts; not live activation instructions |
| [mailserver-rd-roster.md](mailserver-rd-roster.md) | *(Historical)* R&D roster and earlier gate status |
| [history/mailserver-rd/](history/mailserver-rd/) | *(Historical)* R&D notes and coordination records, preserved unchanged |
| [operations/email-warmup-strategy.md](operations/email-warmup-strategy.md) | *(Historical)* Unapproved warm-up proposals; no warm-up is authorized |

## Operations

| Document | What it covers |
| --- | --- |
| [credentials-last.md](credentials-last.md) | Ordered checklist of every credential needed to deploy |
| [../ops/production/README.md](../ops/production/README.md) | Production Compose assembly and `deploy.sh` |
| [production-readiness-plan.md](production-readiness-plan.md) | *(Historical)* Earlier checklist; use handoff gates |
| [operations/supabase.md](operations/supabase.md) | *(Historical)* Earlier Supabase topology; use current Compose and handoff |
| [runbooks/](runbooks/) | Disaster recovery, incident response, stolen-laptop procedure |

## Verification evidence

| Location | What it holds |
| --- | --- |
| [completion/](completion/) | Source-bound milestone receipts, not current deployment certification: [backend-20261030-receipt.md](completion/backend-20261030-receipt.md), [email-finder-20261029.md](completion/email-finder-20261029.md), [frontend-refinement-20261024.md](completion/frontend-refinement-20261024.md); [handoff audit](completion/handoff-20261101/audit.md) |
| [evidence/](evidence/) | Historical raw run logs and review evidence; do not execute archived commands |
| [../code-reviews.md](../code-reviews.md) | Every adversarial review with defect counts and density |

## Plans *(historical)*

[implementation-plan.md](implementation-plan.md), [launch-blockers-plan.md](launch-blockers-plan.md),
[local-completion-plan.md](local-completion-plan.md), [component-adoption.md](component-adoption.md),
[repository-reuse.md](repository-reuse.md), [research/](research/), [design/](design/), [integration/](integration/),
[perf-01/](perf-01/), [reference-repositories/](reference-repositories/), [large-files.md](large-files.md).

## History

[history/README.md](history/README.md) explains how the repository was consolidated and where every earlier
repository, branch and folder went.
