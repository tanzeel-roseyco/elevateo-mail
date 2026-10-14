FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS frontend
WORKDIR /build/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
COPY contracts/ /build/contracts/
# AIDEV-NOTE: Production mode excludes the fixture entry; never copy a prebuilt sibling dist directory.
RUN rm -rf /build/apps/web/dist && npm run build && test -f dist/index.html && test ! -e dist/dev-fixtures.html

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS proxy-build
WORKDIR /build/tests/acceptance
COPY tests/acceptance/package.json tests/acceptance/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tests/acceptance/proxy/ ./proxy/
RUN ./node_modules/.bin/tsc --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --noFallthroughCasesInSwitch --useUnknownInCatchVariables --verbatimModuleSyntax --types node --rootDir proxy --outDir dist proxy/main.ts proxy/proxy.spec.ts

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
WORKDIR /srv/proxy
COPY --from=frontend /build/apps/web/dist/ /srv/web/
COPY --from=proxy-build /build/tests/acceptance/dist/main.js /build/tests/acceptance/dist/server.js /build/tests/acceptance/dist/routing.js /build/tests/acceptance/dist/static.js /build/tests/acceptance/dist/upstream.js ./
COPY --from=proxy-build /build/tests/acceptance/package.json ./package.json
USER node
# AIDEV-NOTE: Root supplies internal DNS app.test, no published ports, and unprivileged_port_start <=80.
EXPOSE 80
CMD ["node", "main.js"]
