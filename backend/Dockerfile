# AIDEV-NOTE: Dedicated build avoids touching Fable's frontend tooling and never receives production credentials.
FROM node:24-bookworm-slim
WORKDIR /app/backend
COPY package.json package-lock.json /app/
RUN cd /app && npm ci --ignore-scripts
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
COPY bridge/ /app/bridge/
COPY tsconfig.json /app/tsconfig.json
COPY eslint.config.js /app/eslint.config.js
ENV CI=1 WRANGLER_SEND_METRICS=false
CMD ["npm", "run", "check"]
