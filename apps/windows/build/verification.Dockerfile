# Build from the repository root after building build/Dockerfile as elevateo-windows-p27-p34:toolchain.
FROM elevateo-windows-p27-p34:toolchain
# AIDEV-NOTE: Skia renders the actual Avalonia views in Linux; use the toolchain's pinned Debian snapshot.
RUN apt-get update && apt-get install -y --no-install-recommends libfontconfig1=2.14.1-4 fonts-dejavu-core=2.37-6 \
    && rm -rf /var/lib/apt/lists/*
COPY apps/windows/ /workspace/
COPY apps/shared/auth-conformance-vectors.json /shared/auth-conformance-vectors.json
ENV ELEVATEO_AUTH_VECTORS=/shared/auth-conformance-vectors.json
# AIDEV-NOTE: restore both runtime graphs at build time so test/package containers can run without networking.
RUN dotnet restore Elevateo.Windows.sln \
    && dotnet restore src/Elevateo.Windows/Elevateo.Windows.csproj -r win-x64
