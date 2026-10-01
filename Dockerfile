# Check image: lint, typecheck, unit tests, build, and Playwright e2e all run inside this container.
# The Playwright base image version must match @playwright/test in package.json.
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV CI=1
CMD ["npm", "run", "check"]
