# AIDEV-NOTE: Reuse the existing fleet browser base; no SDK or emulator is installed on the user's device.
FROM mcr.microsoft.com/playwright@sha256:35246d87a7c88ea9b771c65d33171b2611b02a8253b4b12ce6f94376c55f99f2
COPY fetch_sdk.py /qa/fetch_sdk.py
RUN python3 -I -B /qa/fetch_sdk.py
COPY boot.py relay.py runtime.py gui.mjs test_*.py /qa/
ENV ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk \
    ANDROID_USER_HOME=/work/.android ANDROID_AVD_HOME=/work/avd HOME=/work \
    PATH=/opt/android-sdk/platform-tools:/opt/android-sdk/emulator:${PATH} \
    PYTHONDONTWRITEBYTECODE=1
USER 1001:1001
WORKDIR /work
CMD ["python3", "-I", "-B", "/qa/boot.py"]
