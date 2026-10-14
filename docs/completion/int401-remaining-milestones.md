# Remaining product milestones and authority map

This checklist consolidates existing plans; it adds no implementation scope. Current runtime status is in [state](../../state.md).

## Local application acceptance

- [ ] Preserve final R9 c8 proof: backend390/5792, authenticated HTTP/worker and frontend624/all eight gates PASS. Compilation repair is integrated; Soren R10 runs immutable c3. Await its receipt; do not repeat unchanged gates without an affected-source reason or new failure.
- [ ] Obtain actual browser compilation and four-flow GUI/screenshots through Soren, then execute accepted controlled scenarios. New uncertain-reload source is NOT_RUN; F2 memory-only loss remains OPEN without durable local recovery. Prior units do not satisfy visual acceptance.
- [ ] Complete BE02 race/failure identities, tenant/session invalidation, version conflict/lost ACK, required identity/race/draft/collaboration/search evidence under the [BE02 gate disposition](be02-gate-disposition.md) and [test expansion plan](test-expansion-plan.md). Keep unavailable identities explicit; observer stays OFF in the current GUI candidate.
- [ ] Demonstrate F2 behavior under accepted decisions 85-91: server durability and in-page retention are required; unsaved reload persistence is not required. Record the memory-only limitation explicitly.
- [ ] Root accepts BE02 before opening [BE03](be03-implementation-brief.md): reviewed human approval, immutable send intent, bounded worker/lease/cancellation behavior and deterministic simulated failures. BE03 remains closed; simulation is not real delivery.

## Later completion and production prerequisites

- [ ] Complete remaining local provider-simulator/reconciliation, attachments/security, connector scopes and target-platform clients under the [local completion plan](../local-completion-plan.md) and [release milestones](../implementation-plan.md).
- [ ] Prove deferred private Storage isolation/full restore, platform/MCP/CLI evidence, backup/restore, operational ownership, measured capacity, rollback and client packaging/visual validation. Do not infer these from hashes or contract identity.
- [ ] Resolve address/alias inventory, existing MX/migration, hosting/region, retention and continuity targets; obtain deferred provider/signing credentials and explicit activation authorization under [the activation policy](../../.planning/MAIL_ACCOUNTS_AND_ACTIVATION.md). DNS, live mail, warmup and public deployment remain separate and inactive.

## Legacy reference map

The original checkout retains `.planning/BACKEND-STANDARDS.md`, `docs/product-master-plan.md` and `docs/backend-blueprint.md` at `C:/Users/Tanzeel/Code and projects/Elevateo Mail`. They are older source records, not missing requirements to silently discard or import. The blueprint describes an older independent-mailbox/campaign direction that conflicts with the later shared-company-mailroom brief.

Use [current STANDARDS](../../.planning/STANDARDS.md) for engineering policy; [documentation R01?R17](../../documentation.md), [ADR 0002](../decisions/0002-local-architecture.md) and [local completion plan](../local-completion-plan.md) for current product/architecture scope; canonical `contracts/v1` plus accepted [BE02](be02-implementation-brief.md) and [BE03](be03-implementation-brief.md) briefs for bounded backend contracts. This map identifies current authority, not a claim that every legacy detail was reimplemented. Historical consultation outputs remain immutable evidence.

## Required bounded proof jobs

- Nadia ADV806: real Mailpit recovery/link negatives.
- Rowan ADV807: distinct-process refresh/logout crash/restart.
- Elara ADV808: effective Auth settings and missing-policy negatives.
- Tessa ADV809 recovered existing BE03 consultation artifacts: 40 snapshots and nine artifacts match. Preserve the original working-tree-byte packet and reconcile bounded drift against final BE02; no repeat opinions or BE03 GO implied.
