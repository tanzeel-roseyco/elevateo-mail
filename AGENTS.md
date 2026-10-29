# Instructions for agents working in Elevateo Mail

Read before changing anything: [README.md](README.md), [state.md](state.md), [.planning/STANDARDS.md](.planning/STANDARDS.md)
(binding: violations are defects) and the docs for the area you touch ([docs/README.md](docs/README.md) indexes them).
Historical coordination notes from the multi-agent build (named lanes, R-rounds, fleet leases) are archived in
[docs/history/logs/AGENTS-coordination-log.md](docs/history/logs/AGENTS-coordination-log.md). They do not govern current work.

## Branches

- `main` is the product. Work on `feature/<short-name>`, `bugfix/<short-name>` or `hotfix/<short-name>` branches cut from `main`.
- `archive/**` branches are read-only history. Never commit to them, rebase them or delete them.
- Use `git switch` and `git restore`. Never force-push. Keep commits atomic.

## Boundaries

- `contracts/v1` and `contracts/v2` are the API source of truth. Change the contract in the same commit as the code
  that implements it. Clients regenerate types with `npm run generate:api:v2` (in `apps/web`).
- Web: all backend access goes through the gateway ports in `apps/web/src/data`. Navigation and filter state belongs
  in the URL. Never render message content as HTML. Every simulated or fixture-backed action is labelled as simulated.
- Server: domain logic stays in `apps/server/lib/elevateo`. Migrations are reversible. Steep types stay strict.
- Mail: outbound defaults to `held`. Never send live mail, change DNS/MX, change Cloudflare, or use Google Cloud
  unless the owner explicitly authorizes that specific action.
- Secrets come from the environment only. Never commit a populated `.env`. Add every new variable to
  `.env.production.example` and [docs/credentials-last.md](docs/credentials-last.md).
- Before editing a file, grep it for `AIDEV-` anchors. Preserve their intent and update them when behaviour changes.

## Testing and Docker

- Run all tests in Docker, never on the host. Commands are in the README "Testing" table.
- Build locally on Docker Desktop. Do not use fleet-02 unless the owner authorizes it for that task. Never touch fleet-01.
- After builds, run `docker builder prune -a -f` and `docker image prune -a -f`. Never prune volumes.
- Every feature needs tests for the happy path and its two most likely failure paths. Every bug fix needs a regression test.
- UI work is done only after visual QA in the running app at desktop and mobile widths.

## Reviews and records

- After building, run adversarial reviews of at most 200–400 lines each, plus one design-tradeoff review.
  Record coverage, defects and defect density in [code-reviews.md](code-reviews.md).
- Keep README "Current state", [state.md](state.md) and [documentation.md](documentation.md) accurate in the same commit
  as the change. Put evidence (logs, screenshots) under `docs/completion/<topic>-<date>/`, not in the repository root.
