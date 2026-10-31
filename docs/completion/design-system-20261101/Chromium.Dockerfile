FROM node:24.21.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY contracts/v1 ./contracts/v1
COPY contracts/v2 ./contracts/v2
COPY apps/web ./apps/web
WORKDIR /workspace/apps/web
RUN npm ci && npm install --prefix /tmp/axe --no-package-lock axe-core@4.10.3
ENV ELEVATEO_AXE_SCRIPT=/tmp/axe/node_modules/axe-core/axe.min.js
