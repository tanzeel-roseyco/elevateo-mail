# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
WORKDIR /app
COPY apps/mailbox-mcp/package*.json ./
RUN npm ci --ignore-scripts
COPY apps/mailbox-mcp/ ./
COPY contracts/v2/completion*.json /contracts/v2/
RUN npm run build
USER node
CMD ["node", "dist/src/server.js"]
