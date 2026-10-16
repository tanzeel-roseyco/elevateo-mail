# Android HTTPS fixture ? ANDROID1034

Status: fixture gate passed; installed Android app acceptance NOT_RUN.

## Purpose and boundary

The x86_64 debug APK from ANDROID1031 trusts its synthetic QA CA for `https://elevateo.qa.internal`. This fixture serves the real production web build and Rails/Auth backend over TLS without public DNS, live credentials or external mail. A fixed-destination CONNECT service publishes only `127.0.0.1:19443`; it rejects other destinations, ambiguous framing and excess connections. It preserves origin/cookie/session semantics while replacing untrusted forwarding headers.

The seed runs with outbound mail held and Auth isolated, then validates private credential files before restarting consumers. CA fingerprint, file type, ownership, mode, size and link count are checked before copying. The private certificate key is never included in build context or evidence. HTTPS readiness checks app, auth callback, unauthenticated session and absence of fixture/source routes; a second probe traverses the actual published loopback endpoint. READY starts a30..900-second TTL. Fixture closure always records app acceptance NOT_RUN. TERM/INT/HUP and failure paths use exact task cleanup.

## Evidence

Frozen base `0a2125d648213cd05902d5a52ab6ed80158a1afa` plus28 SHA256-bound files, recorded in `qa815-evidence/android1034-result.json`. R4 tag `android1034-r4-e276609dd607`:108 Python tests passed; strict TypeScript compilation passed;9 real socket/TLS tests passed. Coverage includes fail-closed host/SNI/framing, deadlines, bounded tunnel traffic, cookie forwarding, certificate validation, fixture mutual exclusion, preservation of full acceptance gates, and ownership-aware cleanup.

R1 failed strict compilation at the Node socket type boundary and was corrected to Duplex. R2 was an intermediate scoped pass. R3 failed because its runner lacked Node, its temporary directory prevented mock executables, and two structural/inventory expectations needed adjustment for the separate Android suite. R4 uses the pre-existing pinned Python+Node runner, allows executable task tmpfs for mock scripts, and verifies the TLS-dependent suite separately. Earlier failures remain in private fleet evidence; they are not counted as passes.

Cleanup independently verified the task container, image, builder container, builder registration, cache volume and temporary work directory absent. Shared bases and persistent data remained. Free host bytes254197170176 ->254197088256; shared-host delta-81920 is not attributable reclaimed space. No local Docker build/test occurred.

## Design review and runtime plan

The device had approximately690 MiB available RAM and2.17GB free disk at inspection, below the existing1536MiB emulator allocation. Fleet had approximately36.6GiB available and `/dev/kvm`. Moving the emulator into a task-owned fleet Docker container avoids swapping the user's device; an internal Docker network and fixed CONNECT endpoint must bound egress. KVM is passed as one device with numeric group access, never a privileged container. The proposed container exposes no ADB or emulator port. APK/runtime/screenshots and installed-app checks remain pending until observed. Orca's installed Android skill supports local emulators; remote ADB testing must not be represented as an Orca remote-emulator integration.

The tradeoff is a temporary fleet SDK/system-image download and additional lifecycle handling in exchange for lower local RAM use. One bounded emulator, cold boot, no snapshots and exact task-resource deletion are preferred over a persistent emulator service. Current screenshots/runtime proof are absent, so no visual gate or production release is approved. See `code-reviews.md` for scoped coverage and defect density.
