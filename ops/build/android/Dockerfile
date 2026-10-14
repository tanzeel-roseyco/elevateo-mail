# Supply an immutable JDK 17 image digest and verified tool archive hashes at build time.
ARG JDK17_IMAGE
FROM ${JDK17_IMAGE}
ARG SDK_TOOLS_URL
ARG SDK_TOOLS_SHA256
ARG GRADLE_SHA256
ENV ANDROID_HOME=/opt/android-sdk GRADLE_HOME=/opt/gradle-8.11.1
RUN apt-get update && apt-get install -y --no-install-recommends unzip ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN test -n "$SDK_TOOLS_URL" && test -n "$SDK_TOOLS_SHA256" && test -n "$GRADLE_SHA256" \
 && mkdir -p "$ANDROID_HOME/cmdline-tools" \
 && curl -fsSL "$SDK_TOOLS_URL" -o /tmp/android-tools.zip \
 && printf '%s  %s\n' "$SDK_TOOLS_SHA256" /tmp/android-tools.zip | sha256sum -c - \
 && unzip -q /tmp/android-tools.zip -d "$ANDROID_HOME/cmdline-tools" \
 && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" \
 && curl -fsSL https://services.gradle.org/distributions/gradle-8.11.1-bin.zip -o /tmp/gradle.zip \
 && printf '%s  %s\n' "$GRADLE_SHA256" /tmp/gradle.zip | sha256sum -c - \
 && unzip -q /tmp/gradle.zip -d /opt \
 && rm /tmp/android-tools.zip /tmp/gradle.zip
RUN yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null \
 && "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" 'platforms;android-35' 'build-tools;35.0.0'
WORKDIR /src
