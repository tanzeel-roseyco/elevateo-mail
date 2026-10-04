# Cloud cost research

Assignment 6 of the Connections/efficiency extension. Research checked 4 October 2026 by GPT-6.1 Sol at low effort; consolidated from its returned report. Planning evidence, not a quote, benchmark or approved spending commitment.

## Verified billing structure

- Workers paid starts at US$5/month, including 10 million requests and 30 million CPU milliseconds. Network wait differs from CPU time. An invocation CPU limit is not an account billing cap. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- D1 paid includes 25 billion rows read, 50 million rows written and 5 GB stored; extra storage is US$0.75/GB-month. Index changes add write costs. A database has a 10 GB ceiling and executes queries serially. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/)
- R2 Standard includes 10 GB, one million Class A and ten million Class B operations. Storage beyond the allowance is US$0.015/GB-month. Operations round to whole millions: exceeding the Class A allowance can add US$4.50. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- Queues charges in 64,000-byte chunks, including roughly 100 bytes of metadata. A small successful message normally needs write, read and delete: three operations. One million operations are included on paid, then US$0.40/million. Batching reduces invocations, not each message's charge; retries add work. [Queue pricing](https://developers.cloudflare.com/queues/platform/pricing/), [delivery](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- Pub/Sub basic delivery includes the first 10 GiB monthly; minimum request size, retention and transfer charges still matter. [Google pricing](https://cloud.google.com/pubsub/pricing)

## Scenario, not forecast

Assume 30 days, every mailbox sends 30/day, a small queue job per five-minute reconciliation, no retries, 100 GB total R2 including backups, all other usage inside allowances. USD-to-AUD conversion assumes 1.70 plus 10% tax; neither is a live billing quote.

| Connected mailboxes total | Sends/month | Sync jobs/month | Queue operations | Modelled USD/month | Modelled AUD/month |
| --- | ---: | ---: | ---: | ---: | ---: |
| 30 | 27,000 | 259,200 | 858,600 | 6.35 | 11.87 |
| 100 | 90,000 | 864,000 | 2,862,000 | 7.09 | 13.27 |
| 200 | 180,000 | 1,728,000 | 5,724,000 | 8.24 | 15.41 |

These omit additional notification-driven sync, large message chunks, retries, backfills, log overages and shared-account allowance consumption. They cannot promise maximum traffic below A$15.

## Recommended controls

Propose a 50 GB aggregate R2 pilot allowance including backups: US$0.60 storage plus US$5 Workers is US$5.60 before operation overages, about A$10.47 using the assumptions above. This is not a confirmed allowance. Use Gmail push with coalesced bounded recovery and slow idle reconciliation; active follow-ups need fresh inbox state. Queue IDs, not mail bodies. Bound imports, retained logs, concurrency and retry attempts. Measure storage operations as well as bytes.

Reserve capacity for consent, suppression, receipt capture and recovery. Delay new bulk imports/campaign activation as budgets tighten, rather than dropping essential events. Provider subscriptions, AI, signing, domains and Google assessments remain separate. Inbound volume, attachments and backup retention are the largest unresolved cost inputs. No verified account-wide hard A$15 cap exists; alerts, FX, taxes, delayed usage and hostile traffic prevent such a guarantee.
