# syntax=docker/dockerfile:1
# AIDEV-NOTE: Two stages so the compiler toolchain for pg/nokogiri/psych stays out of the runtime image,
# and a BuildKit cache mount keeps gem archives so a Gemfile.lock change recompiles only what moved.
FROM ruby:4.0.0-slim-bookworm@sha256:d456e74d02e8a83109658bc598c570c5bd69690cdc629a1e0524aabee33b8e20 AS gems
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends build-essential libpq-dev libyaml-dev pkg-config \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV BUNDLE_DEPLOYMENT=0 BUNDLE_PATH=/usr/local/bundle
COPY Gemfile Gemfile.lock* ./
RUN --mount=type=cache,target=/usr/local/bundle/cache,sharing=locked bundle install --jobs 4

FROM ruby:4.0.0-slim-bookworm@sha256:d456e74d02e8a83109658bc598c570c5bd69690cdc629a1e0524aabee33b8e20
# Runtime needs only the shared libraries the native gems link against, plus poppler for attachment text.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends libpq5 libyaml-0-2 poppler-utils \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV BUNDLE_DEPLOYMENT=0 BUNDLE_PATH=/usr/local/bundle
COPY --from=gems /usr/local/bundle /usr/local/bundle
COPY . .
# AIDEV-NOTE: Empty directories may be absent from an archive; create them and fail if ownership setup fails.
RUN useradd --system --uid 10001 --home /app elevateo \
 && install -d -o elevateo -g elevateo /app/tmp /app/log
USER 10001
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
