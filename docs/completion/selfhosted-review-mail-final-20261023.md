# Bounded self-hosted mail final review — 2026-10-23

Task task_b0b1a205f643 / dispatch ctx_b964c171da0c. Implementation owner ctx_07b8e333216d supersedes the earlier owner ID. Read-only static review; only this report was written. No tests, deployment, secret access, cloud/DNS calls or nested workers. Orchestration skill and runtime guide applied. AGENTS.md and .planning/STANDARDS.md read; README/state/documentation context inspected (large combined context output was truncated, so no claim of exhaustive historical-document review).

## Exact source coverage

SHA256 values below describe the full assigned files at inspection time. Physical lines include comments/blanks; no imports or tests inspected.

| Packet | File under ops/selfhosted-mail | Range | Physical LOC | SHA256 |
| --- | --- | --- | ---: | --- |
| A | validation.py | 1–104 | 104 | 0de2f7472b09094e13c9c99af030c63bd956ba1daa6404e5f491eba84248ad13 |
| A | provision.py | 1–48 | 48 | 3e9c7ac4280168e4695153e212cd05c60170f067c9dfe78778f1812e4093c528 |
| B | import_plan.py | 1–34 | 34 | de45c51a08a8e354b8d0e7a5e41eafa57f46680d1503698897f41edc0b3e3fff |
| B | compose.yaml | 1–39 | 39 | f0c5f22ca2945af040918fcd8cf64604c0ac36c2a24dda75265730bc44e54342 |
| B | private_publish.py | 1–20 | 20 | 519c5f5b630e94fb835c0d44b1920fa36747eeb2644f602841eabb24adb7cfdb |

Packet A: 152 LOC, 1 defect, 6.58 defects/KLOC. Packet B: 93 LOC, 0 defects, 0/KLOC. Total: 245 unique physical LOC, 1 defect, 4.08 defects/KLOC. Counts describe this static scope, not the entire project.

## Actionable finding

**MEDIUM — private parent-directory admission missing at standalone provisioning boundary (provision.py:15–22).** `os.open(... O_NOFOLLOW)` rejects a symlink only at `NNN.json`; it follows symlinked `root` and `credentials` directory components. Neither root nor credentials directory is checked for ownership/private permissions, and matching MAIL_ROOT strings does not establish an absolute or safe path. Thus a supplied symlinked credential directory is accepted, and an unsafe writable ancestor permits path substitution across independently opened files. Final file ownership/mode/link-count checks are valuable but do not establish the promised private-directory boundary. This is conditional on unsafe supplied directory topology; no unsafe production topology was inspected or inferred. Require an absolute trusted root and owner-controlled private directory admission before loading manifest/credentials, preferably use stable directory descriptors with no-follow relative opens. Add failure regressions for a symlinked credentials directory, relative root and writable parent. A caller-side guard outside these files could narrow exposure, but no such guard is part of this independently executable entrypoint's inspected contract.

Finding sent immediately to coordinator and current implementation owner through Orca status messages msg_25ade815ccb9 and msg_e0ec70af8988.

## Rubric checklist and evidence limits

- Purpose, null/empty inputs and bounds: reviewed. Exact manifest keys, duplicate JSON rejection, string/domain grammar, account count/uniqueness, integer-vs-bool capacity checks and hold flag fail closed. Invalid CSV headers fail by exception before writing; malformed input is not silently accepted.
- Multicast/reserved-domain fixes: IPv4 explicitly rejects multicast even if is_global is true; documentation apexes and descendants example.com/net/org rejected in addition to listed reserved suffixes. Offline validation does not prove DNS ownership or routability.
- Exact 120 mappings: CSV requires 120 unique localparts, exact assignment-key equality, expected unassigned/planned status, approved account domains and full approved-domain utilization. Actual approved CSV/settings were outside scope, so authenticity and the real 120 identities were NOT verified.
- Private files/symlinks: final credential inode mode0600, regular-file, owner, nlink and size checks present; parent-directory gap above. Manifest/Compose caller trust also remains operationally necessary.
- Secrets/subprocess: password goes over stdin, argv contains account only, no shell, output captured and nonzero exit replaced with generic error. Timeout uses command metadata, not password input. No successful completion is asserted after failed password mutation; earlier accounts can already be updated, explicitly retryable with same inputs. Runtime Mox behavior/redaction not verified.
- Atomic helper: same-directory temporary file defaults private, payload flush/fsync precedes exclusive hard-link publication; existing target (including symlink) is not replaced. Directory fsync follows staging cleanup. This establishes atomic individual-file visibility, not a multi-file transaction; trusted parent topology remains a precondition. Crash immediately after link may leave a pending hardlink; recovery/idempotency beyond this helper was not inspected.
- Held deployment/no HTTP proxy: Compose has one pinned Mox service, host networking, bounded resource/log settings, TLS read-only and no HTTP proxy service. Validation requires outbound_hold true. Actual Mox configuration and network egress enforcement are outside assigned scope; Compose alone does not prove outbound hold, correct listeners or no HTTP listener.
- State coupling, complexity, names, duplication, maintainability: inspected all assigned code; no additional confirmed defect. Helpers are bounded and direct; non-obvious decisions have AIDEV notes. No speculative abstraction recommended.
- Authorization/input sanitization: reviewed at these offline operator boundaries; explicit domain declarations are operator assertions, not ownership verification. Source-level permission gap recorded above.
- Performance: bounded manifest and 120 credentials; no database hot paths. CSV is eagerly loaded before row-count rejection, so operator-controlled file size is a remaining operational precondition, not an independently established safe arbitrary-upload boundary.
- Tests, happy/failure paths and regression coverage: NOT VERIFIED; assignment explicitly prohibited reading tests or running them. Fleet-only runtime evidence remains coordinator-owned. Documentation reviewed only as context; full current feature-document completeness cannot be established within these implementation-only ranges.
- Formatting delegated to linters; no formatting defects counted. No release, activation, live-mail, whole-system approval or runtime PASS is implied.
