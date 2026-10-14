# QA-404 R8 scoped application repair

Source-only repair over e1ee2f9746227a616beff6ddc5e4daeb61c2d144. Cherry-pick ONLY this new commit onto 2c31b41; never merge this branch's observer ancestry. Observer stays OFF. Active full backend run is untouched; Soren alone schedules later Docker gates.

Canonical seccomp changes ONLY syscalls[18].includes from CAP_SYS_CHROOT to {}. All other rules, recipe UID1001, cap_drop ALL, no-new-privileges, sandbox, read-only mounts, limits and pins remain unchanged. Kernel capabilities are not added. Existing tab serialization is retained: canonical SHA256 f922c7c9bfc1ece0b72b244e56dc85756ded002c837fb46054cfd8b275c74b6b differs in whitespace from the paired candidate 322b86b4f7f5b597ed6a9c2cfd6193a4b249a51c8bc9cfba8ff1a485070b24e8; parsed profiles match exactly.

Actual Soren R5 paired direct-ELF diagnostic: baseline inner30s timeout with sys_chroot('/proc/self/fdinfo/') assertion; candidate innerexit0 with expected R4 DOM; exactcleanup0 both. Evidence: sibling reports/soren-r5-paired-probe.json and reports/root-chroot-probe-manifest.json. This is actual narrow probe PASS, not GUI acceptance. New repair runtime, regression, lint and GUI checks NOT_RUN.

Diagnostic scope now truthfully includes skipped authenticated http-acceptance and worker-drain. HTTP progress log occurs only in the full branch. Service readiness and seed provisioning do not imply authenticated HTTP PASS. Earlier diagnostic HTTP PASS wording is superseded by this correction.

Regression guards authenticate the complete canonical profile, reconstruct the complete baseline hash, and freeze existing Compose/Dockerfile bytes. Synthetic phase tests execute the actual main phase AST with fake external calls, checking full and diagnostic call inventories/logs/metadata. Launch helper now asserts RuntimeError propagation for nonzero exit and timeout; quiet success remains covered. No host tests/builds/Docker/dependencies executed. Source diff-check only.

Independent full-rubric source and dedicated design review requested, not completed: packet A seccomp.json chroot stanza plus test_r8_constraints.py1-72 (profile is authenticated by inverse full-file hash); packet B run.py174-198 plus test_launch_diagnostics.py1-61. Each <=200, aggregate <=400. Review purpose/null/empty/max/state effects, simplicity/focus/duplication/names/why-comments/complexity, happy+failure tests/docs/input validation/authorization/performance. Linters own style. Defects and defects/KLOC PENDING; no zero-defect claim. Root assigns independent reviewers and owns shared integration/vault records.

Requested gpt-6.1-sol low/YOLO/Fast; actual identity not attested by this receipt, billed Fast unverified. After source handoff, idle without polling.
