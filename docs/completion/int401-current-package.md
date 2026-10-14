# INT-401 versioned current tools

IN PROGRESS; base c3ecd1f4cc35b98755a523d48032391ccdd0402c.

Use `bash ops/tools/be01-services-tools-v2/parent-run.sh` with Soren-assigned TOOLS_SOURCE, TOOLS_CONTEXT, TOOLS_HOST and TOOLS_EVIDENCE under the fleet mutation lease. The old entrypoint remains frozen historical evidence, not the current integrated runner.

V2 copies the five same-named files from ops/tools/be01-services-tools at base c3ecd1f. Changes are versioned paths, current integrity scope, explanatory comments and two regression dispatches. Existing container restrictions, image pins, cleanup ownership guards and bounded timeouts remain. Its manifest authenticates 43 current tools, regression sources, evidence helpers and wrapper/Compose dependencies. Historical manifests are authenticated as records, not executed to imply product acceptance. The frozen fleet product manifest references excluded runtime .keep files and historical app hashes; socket-free tooling checks do not run that product. No historical files or evidence changed.

Source inspection found no maintained seed/check Compose services or implementations. Both wrappers now advertise bootstrap/up/migrate/stop. The POSIX regression mocks exact Docker argv, invalid/empty/removed commands and failure propagation. Package regression verifies a disposable copy then requires rejection after tampering. Native PowerShell execution remains unverified.

Artifact inspection (not application tests): all 43 current digests match and frozen tool/service/test files remain identical. No local app tests/builds/install or Docker jobs ran. Remote Docker validation and independent review are pending; no PASS claimed.

ADV-729 independent preceding repair review: 68 unique implementation LOC (44 helper +9 preflight +15 scripts/dev), zero new repair defects (0/KLOC), two inherited blockers (29.41/KLOC). Prior integration review: 172 LOC, two defects (11.63/KLOC). Neither is whole-application review.

Review packet A: five V2 implementation files, 151 source LOC. Packet B: both dev wrappers and both new regression scripts, 82 source LOC. Full INT-401 rubric applies; root routes independent adversarial and dedicated design review. Versioned duplication costs maintenance but preserves authentic evidence and safety controls; rewriting historical manifests would invalidate provenance. Removing unsupported commands narrows promises without inventing seed behavior. Decision is recorded in project Obsidian mirror; actual vault remains root-owned.

Ada lifecycle gates remain open: actual R3 log reports PG::InsufficientPrivilege creating app_drafts_private (Rowan owns repair). Hash/contract identity does not prove login/mailbox/thread/draft/reload, tenant/session invalidation, conflict/lost ACK or Storage isolation/restore. Root owns strategy and visual validation. Previous ignored partial export remains retained after automatic approval rejection; no unrelated data removed.
