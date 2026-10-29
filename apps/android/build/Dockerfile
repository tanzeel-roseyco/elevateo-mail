# Local Docker Desktop (linux/amd64) recipes for the Android lane. Build context: repository root.
#
#   docker build -f apps/android/build/Dockerfile --target build \
#     --build-arg RUST_IMAGE="$RUST_IMAGE" -t elevateo-android-build .
#   docker run --rm -v "$PWD:/src" -v "$APK_BUILD_ROOT:/artifacts" -e APK_BUILD_ROOT=/artifacts \
#     -w /src --user 1000:1000 elevateo-android-build bash apps/android/build/build-apk.sh
#
#   docker build -f apps/android/build/Dockerfile --target emulator \
#     --build-arg RUST_IMAGE="$RUST_IMAGE" -t elevateo-android-emulator .
#   docker run --rm --device /dev/kvm -v "$APK_BUILD_ROOT:/artifacts" \
#     elevateo-android-emulator bash /opt/elevateo/apps/android/build/emulator-acceptance.sh \
#       /artifacts/elevateo-android-x86_64-qa.apk /artifacts/qa-trust /artifacts/acceptance
#
# AIDEV-NOTE: Pins mirror ops/build/android/Dockerfile (coordinator-owned): JDK 17, API 36,
# AIDEV-NOTE: build-tools 36.0.0, NDK 28.2.13676358, Tauri CLI 2.12.2, SDK tools zip SHA-256.
# RUST_IMAGE must be a reviewed immutable Rust 1.90.0 Debian image digest.
ARG RUST_IMAGE

# --- Web fixture bundle (served to the emulator by the acceptance script) ---------------------
# Same pinned node digest as apps/web/docker/test.Dockerfile.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS webfixtures
WORKDIR /workspace
COPY contracts/v1 ./contracts/v1
COPY contracts/v2 ./contracts/v2
COPY apps/web ./apps/web
WORKDIR /workspace/apps/web
RUN npm ci
# The fixtures mode emits dev-fixtures.html alongside the app bundle (vite.config.ts).
RUN npx vite build --mode fixtures

# --- APK build stage ---------------------------------------------------------------------------
FROM ${RUST_IMAGE} AS build
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
    && rm /tmp/android-tools.zip \
    && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
RUN yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null \
    && "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
      'platforms;android-36' 'platforms;android-37.0' \
      'build-tools;36.0.0' 'ndk;28.2.13676358' 'platform-tools'
# x86_64 is the local-emulator QA target; aarch64 stays available for the device candidate.
RUN rustup target add aarch64-linux-android x86_64-linux-android \
    && cargo install tauri-cli --version '=2.12.2' --locked
ARG QA_UID=1000
ARG QA_GID=1000
RUN groupadd --gid "$QA_GID" elevateoqa \
    && useradd --uid "$QA_UID" --gid "$QA_GID" --create-home elevateoqa
WORKDIR /src

# --- Headless emulator acceptance stage --------------------------------------------------------
FROM build AS emulator
# API 36 google_apis x86_64 image: adb root works (no Play Store) and matches the QA APK target.
RUN yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null \
    && "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
      'emulator' 'system-images;android-36;google_apis;x86_64'
COPY --chown=1000:1000 apps/android /opt/elevateo/apps/android
COPY --from=webfixtures --chown=1000:1000 /workspace/apps/web/dist /opt/elevateo/web-fixtures
ENV ELEVATEO_FIXTURE_DIST=/opt/elevateo/web-fixtures \
    ELEVATEO_ANDROID_LANE=/opt/elevateo/apps/android
USER elevateoqa
WORKDIR /opt/elevateo
