# Fleet-02 validation stages for the repaired FE-01-R1 frontend snapshot. Authored only; the
# parent reviews, transfers and runs. Build context = the explicit snapshot root (contracts/v1 +
# apps/web, no node_modules/results). Both targets share the install layers, so the isolated
# docker-container builder caches npm ci once.
#
#   docker buildx build --builder <B> --load --target unit    -t <unit-img>    -f validation.Dockerfile <ctx>
#   docker buildx build --builder <B> --load --target browser -t <browser-img> -f validation.Dockerfile <ctx>

# --- unit: mirrors apps/web/docker/test.Dockerfile (same pinned base, same command order) -------
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS unit

WORKDIR /workspace
COPY contracts/v1 ./contracts/v1
COPY apps/web ./apps/web

WORKDIR /workspace/apps/web
# npm ci enforces the committed resolution; installation still needs registry access.
RUN npm ci

# Regeneration, lint, types and tests precede the production bundle marker check.
# Bundle markers alone do not prove runtime fixture isolation; the browser target covers that.
# Marker scan accepts ONLY grep status 1 (clean scan): 0 means a marker leaked and >=2 is an
# operational error — a bare `! grep` would let status 2 pass. probes.sh P9-P11 regression-cover
# this expression; keep them in sync.
CMD ["bash", "-ceu", "npm run check:api && npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && st=0 && { grep -rl 'dev-fixtures\\|Development fixtures\\|fixture_token_a' dist || st=$?; } && [ \"$st\" -eq 1 ]"]

# --- browser: pinned Playwright image over the installed workspace -----------------------------
FROM mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f AS browser

COPY --from=unit /workspace /workspace
WORKDIR /workspace/apps/web

# Build the real production artifact, serve it on 4174 (page.route supplies every /v1 response, so
# a static preview is the correct origin), wait for readiness, then run the full e2e matrix. The
# playwright config's own webServer serves the fixture entry on 4173.
CMD ["bash", "-ceu", "\
npm run build && \
(npm run preview -- --host 127.0.0.1 --port 4174 --strictPort >/tmp/preview.log 2>&1 &) && \
for i in $(seq 1 60); do curl -fsS http://127.0.0.1:4174/ >/dev/null 2>&1 && break; sleep 1; done && \
curl -fsS http://127.0.0.1:4174/ >/dev/null && \
ELEVATEO_PRODUCTION_URL=http://127.0.0.1:4174 npm run test:e2e -- --workers=2"]
