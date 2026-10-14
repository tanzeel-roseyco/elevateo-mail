# APK-813 Astrid handoff — 2026-10-14

Baseline `bbf2353b254a05d48c2da7a508c143e6fba78691`, isolated `completion-astrid-apk813` worktree. Scope: Java Android offline activity, exact callback URI/state shape validator, unit fixtures and Soren-only Docker build recipe. Sources: `apps/android/`, `ops/build/android/`. The existing Rails/web sources and frozen BE02/BE03 contracts are untouched.

Dependency choice: Android Gradle Plugin 8.9.2, Gradle 8.11.1, JDK 17, API/Build Tools 35.0.0 align with the official [AGP 8.9 compatibility table](https://developer.android.com/build/releases/agp-8-9-0-release-notes). JUnit 4.13.2 is limited to local JVM validation. Fleet build must supply and record immutable JDK image digest and verified archive hashes; none are presumed here.

Design simulation for root: a Java native activity avoids a second embedded web surface, at the cost of implementing mailbox screens after the versioned session contract. Sharing Tauri UI with Android would reduce duplicated presentation code, but would expand the native IPC/WebView boundary and diverge from the accepted Java Android direction. Keep the Rails wire contract as the common seam; this simulation is not a measured tradeoff or acceptance decision.

Requested Soren execution: Docker image build and `bash ops/build/android/build-unsigned.sh` under the shared lease, capture three unit test outcomes, APK SHA-256, image/tool digest evidence and exact cleanup. Executed: no host or Docker application build/test. Unsigned APK compiled: **NO EVIDENCE / NOT_RUN**. Emulator/device, signature, upgrade, lifecycle, network, keyboard/insets, App Link and OAuth checks: **NOT_RUN**. Android shell has no authenticated mailbox workflow. Browser Playwright cannot substitute for these checks.

API/session dependency: Cassian must provide an accepted versioned native auth/session and callback contract before wiring App Links. Orion owns the Tauri shell; this branch exports no shared native code and changes no Orion paths. Keystore requirements and minimized permission plan are in `apps/android/README.md`. No keys, live credentials or provider registration exist here.

Candidate SHA: recorded in the final outbox after commit. Independent adversarial and dedicated design reviews: **NOT_PERFORMED**; root schedules bounded review. Self inspection of the source is not counted as independent coverage or defects/KLOC.
