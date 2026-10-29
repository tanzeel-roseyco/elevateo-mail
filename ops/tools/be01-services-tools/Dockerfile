FROM --platform=linux/amd64 ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
# AIDEV-NOTE: Separate BE01 services test tools; frozen sources are mounted read-only only at runtime, without a Docker socket.
RUN test "$(dpkg --print-architecture)" = amd64 \
 && rm /etc/apt/sources.list.d/debian.sources \
 && printf '%s\n' \
 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20261010T000000Z bookworm main' \
 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/20261010T000000Z bookworm-security main' \
 > /etc/apt/sources.list \
 && apt-get -o Acquire::Retries=2 -o Acquire::https::Timeout=30 update \
 && apt-get -o Acquire::Retries=2 -o Acquire::https::Timeout=30 install -y --no-install-recommends \
 bash coreutils grep jq ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# AIDEV-NOTE: Reuse reviewed Lane P gem checksum; install only Minitest, never alter the product bundle.
ADD --checksum=sha256:153ea36d1d987a62942382b61075745042a2b3123b1cd48f4c3675af9cc7d6f1 https://rubygems.org/downloads/minitest-6.0.6.gem /tmp/minitest-6.0.6.gem
RUN gem install --local --ignore-dependencies --no-document /tmp/minitest-6.0.6.gem && rm /tmp/minitest-6.0.6.gem
COPY checks.sh /opt/be01-services/checks.sh
RUN chmod 444 /opt/be01-services/checks.sh
ENV HOME=/tmp
USER 10001:10001
WORKDIR /src
ENTRYPOINT ["bash"]
