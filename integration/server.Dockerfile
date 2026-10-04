# AIDEV-NOTE: Builds the REAL server from its own worktree (the build context) and adds only the test harness from
# this repository (the `harness` named context). Nothing here is deployed and no credential is involved.
#   docker build -f integration/server.Dockerfile --build-context harness=integration -t elevateo-mail-it-server "<server worktree>"
FROM node:24-bookworm-slim
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
ENV CI=1 WRANGLER_SEND_METRICS=false
# Worker types and the bundled Worker the server's own bootstrap runs on workerd.
RUN npm run types && npm run build
COPY --from=harness harness.ts ./harness.ts
EXPOSE 8787 8788
CMD ["npx", "tsx", "harness.ts"]
