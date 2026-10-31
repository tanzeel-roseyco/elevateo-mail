# Build/test/package image for the Elevateo Windows client.
# AIDEV-NOTE: Linux cross-publishes win-x64; native Windows installation remains a separate release gate.
FROM mcr.microsoft.com/dotnet/sdk:8.0.415-bookworm-slim@sha256:4632e98dc703311ca09d0c37170fe70ad4ba334bd88a841c78cbcc9d29994b2c

# AIDEV-NOTE: snapshot pins transitive Debian dependencies as well as the packaging tools.
RUN rm /etc/apt/sources.list.d/debian.sources \
    && printf 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20260101T000000Z bookworm main\n' > /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nsis=3.08-3+deb12u1 osslsigncode=2.5-4 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
