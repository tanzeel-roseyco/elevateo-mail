FROM swift:6.0@sha256:1a1c10372d9c6c0ba9b6151085e0a26ee83a79968b3c738a47a70eac1a70bba4
# AIDEV-NOTE: Run the repository's Linux Core gate with one compiler job on shared Docker Desktop.
WORKDIR /workspace
COPY apps/shared ./shared
COPY apps/ios/ElevateoCore ./ios/ElevateoCore
COPY apps/ios/signing-helpers.sh apps/ios/test_signing_helpers.py ./ios/
ENV ELEVATEO_AUTH_VECTORS=/workspace/shared/auth-conformance-vectors.json
WORKDIR /workspace/ios/ElevateoCore
CMD ["sh", "-c", "swift build --jobs 1 && swift test --jobs 1"]
