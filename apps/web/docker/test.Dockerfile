# syntax=docker/dockerfile:1
# Coordinator-run typecheck/unit/build container for apps/web. Build context must be the
# repository root so the canonical contracts are available to tests and type generation.
#   docker build -f apps/web/docker/test.Dockerfile -t elevateo-web-test .
#   docker run --rm elevateo-web-test
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

WORKDIR /workspace/apps/web
# AIDEV-NOTE: Manifests are copied before the source so a source edit reuses the installed
# dependency layer; the npm cache mount keeps tarballs across rebuilds. npm ci still enforces
# the committed resolution and still needs registry access on a cold cache.
COPY apps/web/package.json apps/web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

WORKDIR /workspace
COPY contracts/v1 ./contracts/v1
COPY contracts/v2 ./contracts/v2
COPY apps/web ./apps/web
WORKDIR /workspace/apps/web

# Regeneration, lint, types and tests precede the production bundle marker check.
# AIDEV-NOTE: Bundle markers alone do not prove runtime fixture isolation; browser QA is separate.
CMD ["bash", "-ceu", "npm run check:api && npm run check:api:v2 && npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && npm run check:bundle && ! grep -rl 'dev-fixtures\\|Development fixtures\\|fixture_token_a' dist"]
