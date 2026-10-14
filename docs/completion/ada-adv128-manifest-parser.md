# ADV128 — manifest parser successor

Exact reviewed source: Astrid b3fec57729019ad0fe3942be912dbabcc794bd14, fleet-02 /home/tanzeel/orca/workspaces/integration/completion-astrid-apk813. Source-only; no tests, builds, Docker or live operations performed.

## Coverage / defects

250 unique versioned LOC: apps/android/verify_manifest_tree.py1–47; test_verify_manifest_tree.py1–68; verify_permissions.py1–58; test_verify_permissions.py1–77. No parent version read. Each individual source packet under180 LOC; total under350. Confirmed defects0; density0/250=0/KLOC. Omitted unsigned/signature validation, pinning script, build wrapper, executable/tool identity, packaged manifest bytes and wider native shell. No claim of whole APK acceptance.

## Root and ancestry repair

The exact Android namespace must start output, immediately followed by a two-space manifest element. A four-space application element must exist, and no two-space element may precede it after the manifest. This closes the supplied REV894 scenario: namespace + manifest + unrelated two-space sibling + four-space application now rejects. Flat trees, missing application, zero-exit usage/empty output, nonzero exit, stderr diagnostics and OSError reject. VIEW is rejected anywhere in the output, conservatively including unrelated text.

This is a bounded structural sanity check of a trusted tool's rendering, not a general parser or proof that arbitrary supplied text is a valid XML tree. It does not validate every remaining line or reject every possible trailing unrelated sibling. Do not describe it as complete grammar validation. The task's specific pre-application sibling failure is closed in source. Exact indentation is an intentional tool-format dependency; it must be proven against the actual pinned aapt36, not assumed from Debian aapt or synthetic fixtures.

## Permission boundary

The permission list is exact and rejects empty, whitespace-padded, duplicate, missing or unwanted entries. Merged XML requires one exact fixture-scoped signature receiver declaration and exactly the two allowed uses-permission entries; uses-permission variants participate in that check. Tests cover CAMERA, namespace substitution, weakened signature, missing/duplicate declaration and SDK-specific extra permission. Input parse errors fail closed; uncaught file-read errors also terminate unsuccessfully rather than pass. These functions do not independently bind the merged XML to packaged APK bytes: that remains the omitted wrapper/artifact gate.

## Tests and design

The successor adds the precise unrelated-sibling regression, with valid-format acceptance and negative VIEW/tool/flat cases retained. Positive tree is intentionally minimal, so it proves the predicate's expected shape rather than realistic packaged-manifest integration. No new abstraction or dependency is needed. Fixed regular expressions plus standard XML parsing are small and readable; processing is linear scans of this small manifest input. Names and comments communicate fail-closed intent; no production authority/session changes occur.

Simulation: malformed sibling before application rejects; legitimate namespace/manifest/application rendering passes if no VIEW. Formatting drift in pinned aapt causes a safe false rejection, requiring verified format adjustment rather than relaxing checks blindly. An unexpected permission rejects independently even if the tree passes. A missing/broken tool cannot silently produce success. A fabricated mostly valid textual dump is outside the trusted executable boundary and must not substitute for packaged-binary evidence.

## Runtime gate and provenance

Parent supplied retained APK identity32d043f and evidence path Sorenqa815-evidence/android-32d043fbce8e-aapt-dump.txt with SHA256 a354109de14f9d9e7b9fc71a07ab047b904403a0fa0a13d60042950ecbc500e8, Debian aapt only. These are supplied provenance, not independently inspected evidence in this assignment; the path was not found beneath the shared completion root by a narrow filename lookup. Pinned36 runtime remains pending.

Soren should run exact successor positive/negative tests and the pinned tool against the retained actual packaged APK, record executable version/hash, artifact hash and dump hash, and confirm both manifest and permission predicates consume the intended artifact/merged manifest. Keep compile-only/unsigned status explicit. Static review accepts neither APK distribution nor OS runtime behavior.
