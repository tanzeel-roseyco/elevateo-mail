# Build/test/package image for the Elevateo Windows client.
# AIDEV-NOTE: everything runs on Linux by design — Avalonia publishes win-x64 cross-platform,
# NSIS (makensis) and osslsigncode both run on Linux, so no Windows build host is required.
FROM mcr.microsoft.com/dotnet/sdk:8.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends nsis osslsigncode \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
