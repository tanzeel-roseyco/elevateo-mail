# Engineering standards — DRAFT, NOT APPROVED

No application implementation may begin until the user explicitly approves these standards. Review each section with the user. Repository scaffolding does not approve technology choices.

## Language and versions
Proposed: strict TypeScript; runtime and framework versions TBD after inspecting any existing frontend. No unjustified any types.

## Architecture and layering
Proposed: modular monolith with API and background worker. Domain modules own rules; integration adapters own provider details. PostgreSQL is proposed durable storage. Avoid speculative abstractions and microservices.

## Naming and comments
Use domain-specific names. Add AIDEV-NOTE comments for non-obvious decisions and cross-file coupling, at most 120 characters. Search existing anchors before editing; update affected comments with code.

## Errors and boundaries
Validate external inputs, configuration, and webhooks. Handle errors deliberately. Model ambiguous send outcomes explicitly. Authenticate events using the chosen provider mechanism. Never expose secrets in logs.

## Testing and coverage
Docker-based lint, typecheck, unit and integration checks before application publication. Features cover happy path and two likely failures; fixes include regression tests. Cover critical invariants and recovery paths. Numeric coverage target TBD. Frontend requires actual visual validation.

## State and API conventions
Durable business records in the database. One campaign scheduling authority. Document API schemas, pagination, errors, idempotency, and frontend empty/loading/error states. Version external contracts deliberately.

## Security
Least privilege, protected credentials, authorization on every resource operation, consent evidence, suppression enforcement, and safe email HTML rendering. Retention and tenant isolation requirements TBD.

## Performance and operations
Define sending volume, API latency, sync freshness, recovery objectives, and rate budgets before implementation. Do not invent targets. Reconcile missed events and track send failures. Clean task-created disposable Docker resources while preserving persistent data.
