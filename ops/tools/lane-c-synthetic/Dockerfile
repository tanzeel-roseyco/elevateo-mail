FROM ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
# AIDEV-NOTE: Separate test tooling; no application source, Docker client or socket is baked into this image.
RUN apt-get update && apt-get install -y --no-install-recommends bash coreutils jq grep \
    && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp
WORKDIR /src
USER 10001:10001
CMD ["bash"]
