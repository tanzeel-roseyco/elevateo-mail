FROM mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f
COPY --from=elevateo-client-web:20261101 /workspace /workspace
COPY --from=elevateo-client-web:20261101 /usr/local/bin/node /usr/local/bin/node
COPY apps/web/src /workspace/apps/web/src
WORKDIR /workspace/apps/web
