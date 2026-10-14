# RUST_IMAGE must be a reviewed immutable Rust 1.90.0 Debian image digest.
ARG RUST_IMAGE
FROM ${RUST_IMAGE}
ARG NODE_ARCHIVE_SHA256=dafe2e8f82cb97de1bd10db9e2ec4c07bbf53389b0799b1e095a918951e78fd4
ARG SDK_TOOLS_URL=https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip
ARG SDK_TOOLS_SHA256=4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583
ENV ANDROID_HOME=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    NDK_HOME=/opt/android-sdk/ndk/28.2.13676358 \
    PATH=/opt/node-v22.15.0-linux-x64/bin:/root/.cargo/bin:${PATH}
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk curl ca-certificates unzip xz-utils python3 pkg-config \
    libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev librsvg2-dev patchelf \
    && rm -rf /var/lib/apt/lists/*
RUN test -n "$NODE_ARCHIVE_SHA256" && test -n "$SDK_TOOLS_URL" && test -n "$SDK_TOOLS_SHA256" \
    && curl -fsSL https://nodejs.org/dist/v22.15.0/node-v22.15.0-linux-x64.tar.xz -o /tmp/node.tar.xz \
    && printf '%s  %s\n' "$NODE_ARCHIVE_SHA256" /tmp/node.tar.xz | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /opt \
    && mkdir -p "$ANDROID_HOME/cmdline-tools" \
    && curl -fsSL "$SDK_TOOLS_URL" -o /tmp/android-tools.zip \
    && printf '%s  %s\n' "$SDK_TOOLS_SHA256" /tmp/android-tools.zip | sha256sum -c - \
    && unzip -q /tmp/android-tools.zip -d "$ANDROID_HOME/cmdline-tools" \
    && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
RUN yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null \
    && "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
      'platforms;android-37' 'build-tools;36.0.0' 'ndk;28.2.13676358' 'platform-tools'
RUN rustup target add aarch64-linux-android \
    && cargo install tauri-cli --version '=2.12.0' --locked
WORKDIR /src
