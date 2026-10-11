# syntax=docker/dockerfile:1
FROM ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends build-essential libpq-dev libyaml-dev pkg-config \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV BUNDLE_DEPLOYMENT=0 BUNDLE_PATH=/usr/local/bundle
COPY Gemfile Gemfile.lock* ./
RUN bundle install --jobs 4
COPY . .
RUN useradd --system --uid 10001 --home /app elevateo && chown -R elevateo /app/tmp /app/log 2>/dev/null || true
USER 10001
CMD ["bin/rails", "server", "-b", "0.0.0.0"]
