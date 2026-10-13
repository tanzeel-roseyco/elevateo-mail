# Repository dossiers and source map

Target-architecture update (2026-10-13): source-language facts, scores and historical tests below remain unchanged. [ADR 0002](../decisions/0002-rails-laravel-presentation.md) selects Rails domain/API/worker + Laravel Blade/Livewire/Alpine presentation, Supabase and Resend. The [current adoption matrix](../component-adoption.md) and [reuse playbook](../component-reuse-playbook.md) supersede earlier Node/React destination suggestions; React components are translated, not installed as the product UI. Named consultations remain for the next agent; none is completed by this update.

This collection documents every imported repository independently at the exact audited revision. It accompanies real source files under [third_party/upstream](../../third_party/upstream), not just GitHub links or submodules. [The inventory](../../third_party/README.md) explains provenance, included/omitted files, licenses and verification.

| Repository | Earlier engineering score | Product role in Elevateo | Dossier |
| --- | ---: | --- | --- |
| Quickly | 53/100 | Strong inbox/composer reference; sending and auth require replacement | [Detailed analysis](quickly.md) |
| Wu-Wei-Mail | 56/100 | Workspace and worker boundaries; recovery/auth defects to repair | [Detailed analysis](wu-wei-mail.md) |
| cold-cli | 59/100 | Scheduling invariants and deterministic tests; no shared mailbox UI | [Detailed analysis](cold-cli.md) |
| lightreach | 39/100 | Small TypeScript UI/MCP patterns; lacks team authorization | [Detailed analysis](lightreach.md) |
| Instantly starter kit | 43/100 | Typed adapter contracts; depends on Instantly's external backend | [Detailed analysis](instantly-starter-kit.md) |
| BillionMail | 49/100 | Mail-server operations reference; adds AGPL and significant infrastructure | [Detailed analysis](billionmail.md) |

The score weights and all original findings are preserved in [audit-scorecards.json](../research/audit-scorecards.json). Those product-fit scores assessed the earlier outreach brief; they are not refreshed scores for the current shared-company-mailbox design. No score constitutes certification.

Each dossier covers purpose, exact provenance, architecture, source-module map, code and component scores, data model, authentication, providers, background work, UI, AI/integrations, dependency and operational risks, earlier test evidence, concrete adoption/rejection decisions and mapping to our goals. Local source links make the code inspectable without depending on an upstream branch remaining unchanged.

“Everything” here means complete file inventory and systematic subsystem documentation. It does not claim every one of hundreds of thousands of source lines has been independently reviewed, every execution path tested, or every dependency licensed/audited. Unknowns, untested areas and observed failures are stated explicitly. The intake preserves known defects as reference evidence; it does not turn the imported applications into a finished Elevateo product.

Use [component adoption](../component-adoption.md) to choose work, [goals and traceability](../goals-and-traceability.md) to understand why, and [the implementation plan](../implementation-plan.md) for release gates.
