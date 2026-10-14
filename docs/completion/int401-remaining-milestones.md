# Remaining product milestones and authority map

This checklist consolidates existing plans; it adds no implementation scope. Current runtime status is in [state](../../state.md).

## Local application acceptance

- [ ] Validate the new repair SHA: targeted Auth/revocation/logout/worker regressions, strict typing/lint, full affected backend, authenticated HTTP and worker drain. R8 on 94d passed backend/HTTP but failed worker drain; preserve its immutable receipt.
- [ ] Re-run all eight frontend gates (R8 unit had two failures, other seven passed) and real login/mailbox/thread/draft/reload/logout GUI journeys with screenshots. Prior mock or unit passes do not satisfy visual acceptance.
- [ ] Complete BE02 race/failure identities, tenant/session invalidation, version conflict/lost ACK, private Storage isolation and restore evidence required by the [BE02 gate disposition](be02-gate-disposition.md) and [test expansion plan](test-expansion-plan.md). Keep unavailable identities explicit; observer stays OFF in the current GUI candidate.
- [ ] Resolve F2 durable draft recovery, or obtain an explicit product disposition; memory-only retention is not durable recovery.
- [ ] Root accepts BE02 before opening [BE03](be03-implementation-brief.md): reviewed human approval, immutable send intent, bounded worker/lease/cancellation behavior and deterministic simulated failures. BE03 remains closed; simulation is not real delivery.

## Later completion and production prerequisites

- [ ] Complete remaining local provider-simulator/reconciliation, attachments/security, connector scopes and target-platform clients under the [local completion plan](../local-completion-plan.md) and [release milestones](../implementation-plan.md).
- [ ] Prove backup/restore, operational ownership, measured capacity, rollback and client packaging/visual validation. Do not infer these from hashes or contract identity.
- [ ] Resolve address/alias inventory, existing MX/migration, hosting/region, retention and continuity targets; obtain deferred provider/signing credentials and explicit activation authorization under [the activation policy](../../.planning/MAIL_ACCOUNTS_AND_ACTIVATION.md). DNS, live mail, warmup and public deployment remain separate and inactive.

## Legacy reference map

The original checkout retains `.planning/BACKEND-STANDARDS.md`, `docs/product-master-plan.md` and `docs/backend-blueprint.md` at `C:/Users/Tanzeel/Code and projects/Elevateo Mail`. They are older source records, not missing requirements to silently discard or import. The blueprint describes an older independent-mailbox/campaign direction that conflicts with the later shared-company-mailroom brief.

Use [current STANDARDS](../../.planning/STANDARDS.md) for engineering policy; [documentation R01?R17](../../documentation.md), [ADR 0002](../decisions/0002-local-architecture.md) and [local completion plan](../local-completion-plan.md) for current product/architecture scope; canonical `contracts/v1` plus accepted [BE02](be02-implementation-brief.md) and [BE03](be03-implementation-brief.md) briefs for bounded backend contracts. This map identifies current authority, not a claim that every legacy detail was reimplemented. Historical consultation outputs remain immutable evidence.
