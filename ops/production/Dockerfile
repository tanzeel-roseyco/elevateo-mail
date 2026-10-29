# AIDEV-NOTE: The operations image holds source/tools only; all authority is injected per one-shot service.
FROM ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
RUN apt-get update && apt-get install -y --no-install-recommends python3 openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY ops /ops
USER 10001:10001
