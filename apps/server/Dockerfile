# syntax=docker/dockerfile:1
FROM ruby:4.0.0-slim-bookworm@sha256:d456e74d02e8a83109658bc598c570c5bd69690cdc629a1e0524aabee33b8e20
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends build-essential libpq-dev libyaml-dev pkg-config poppler-utils \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV BUNDLE_DEPLOYMENT=0 BUNDLE_PATH=/usr/local/bundle
COPY Gemfile Gemfile.lock* ./
RUN bundle install --jobs 4
COPY . .
# AIDEV-NOTE: Empty directories may be absent from an archive; create them and fail if ownership setup fails.
RUN useradd --system --uid 10001 --home /app elevateo \
 && install -d -o elevateo -g elevateo /app/tmp /app/log
USER 10001
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
