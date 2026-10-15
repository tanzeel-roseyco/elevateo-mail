# RUST_IMAGE must be a reviewed immutable Rust 1.90.0 Debian image digest.
ARG RUST_IMAGE
FROM ${RUST_IMAGE}
ARG SDK_TOOLS_URL=https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip
ARG SDK_TOOLS_SHA256=4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583
ENV ANDROID_HOME=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    NDK_HOME=/opt/android-sdk/ndk/28.2.13676358 \
    PATH=/root/.cargo/bin:${PATH}
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk curl ca-certificates openssl unzip python3 pkg-config \
    libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev librsvg2-dev patchelf \
    && rm -rf /var/lib/apt/lists/*
RUN test -n "$SDK_TOOLS_URL" && test -n "$SDK_TOOLS_SHA256" \
    && mkdir -p "$ANDROID_HOME/cmdline-tools" \
    && curl -fsSL "$SDK_TOOLS_URL" -o /tmp/android-tools.zip \
    && printf '%s  %s\n' "$SDK_TOOLS_SHA256" /tmp/android-tools.zip | sha256sum -c - \
    && unzip -q /tmp/android-tools.zip -d "$ANDROID_HOME/cmdline-tools" \
    && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
RUN yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null \
    && "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
      'platforms;android-36' 'platforms;android-37.0' \
      'build-tools;36.0.0' 'ndk;28.2.13676358' 'platform-tools'
# AIDEV-NOTE: ARM64 is the device candidate; x86_64 is the separate local-emulator QA package.
RUN rustup target add aarch64-linux-android x86_64-linux-android \
    && cargo install tauri-cli --version '=2.12.2' --locked
# AIDEV-NOTE: Java resolves this disposable user's writable home without overriding the host HOME variable.
ARG QA_UID=1000
ARG QA_GID=1000
RUN groupadd --gid "$QA_GID" elevateoqa \
    && useradd --uid "$QA_UID" --gid "$QA_GID" --create-home elevateoqa
WORKDIR /src
