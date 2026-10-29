# Coordinator-run typecheck/unit/build container for apps/web. Build context must be the
# repository root so the canonical contracts are available to tests and type generation.
#   docker build -f apps/web/docker/test.Dockerfile -t elevateo-web-test .
#   docker run --rm elevateo-web-test
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

WORKDIR /workspace
COPY contracts/v1 ./contracts/v1
COPY contracts/v2 ./contracts/v2
COPY apps/web ./apps/web

WORKDIR /workspace/apps/web
# AIDEV-NOTE: npm ci enforces the committed resolution; installation still needs registry access.
RUN npm ci

# Regeneration, lint, types and tests precede the production bundle marker check.
# AIDEV-NOTE: Bundle markers alone do not prove runtime fixture isolation; browser QA is separate.
CMD ["bash", "-ceu", "npm run check:api && npm run check:api:v2 && npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && npm run check:bundle && ! grep -rl 'dev-fixtures\\|Development fixtures\\|fixture_token_a' dist"]
