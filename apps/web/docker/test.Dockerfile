# Coordinator-run typecheck/unit/build container for apps/web. Build context must be the
# repository root so the canonical contracts are available to tests and type generation.
#   docker build -f apps/web/docker/test.Dockerfile -t elevateo-web-test .
#   docker run --rm elevateo-web-test
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

WORKDIR /workspace
COPY contracts/v1 ./contracts/v1
COPY apps/web ./apps/web

WORKDIR /workspace/apps/web
# The coordinator resolves and commits package-lock.json first; npm ci enforces it offline-stable.
RUN npm ci

# R1 regeneration check, strict typecheck, unit/integration tests, then a production build whose
# output must contain no fixture entry or fixture data (verified by the grep below; the negative
# runtime test lives in conformance.test.ts).
CMD ["bash", "-ceu", "npm run check:api && npm run typecheck && npm run test -- --coverage && npm run build && ! grep -rl 'dev-fixtures\\|Development fixtures\\|fixture_token_a' dist"]
