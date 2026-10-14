FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
LABEL task="elevateo-preview-20261014"
WORKDIR /build/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
COPY contracts/ /build/contracts/
RUN npm run typecheck && ./node_modules/.bin/vite build --mode fixtures && test -f dist/dev-fixtures.html
USER node
EXPOSE 8080
CMD ["./node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "8080", "--strictPort"]
