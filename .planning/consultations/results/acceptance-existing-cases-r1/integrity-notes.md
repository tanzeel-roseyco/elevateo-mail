# Final artifact integrity and late changes

Date: 2026-10-14 Australia/Sydney. This is consultation provenance, not an application test result.

<!-- AIDEV-NOTE: Keep the initial mismatch report; distinguish real document drift from serialization/checker effects. -->

The initial [verification.json](verification.json) is retained unchanged. Its five mismatch entries are resolved or classified below; none is silently removed. The final [verification-followup.json](verification-followup.json) records follow-up checks and final deliverable hashes.

| Initial mismatch | Investigation and disposition |
| --- | --- |
| README.md whole-file hash | The supplied status paragraph changed during this task: the previous “four Docker mount regressions passed; source review pending” sentence now reports the initial fixture-mode defect, corrected four passing cases, and final source-review reconciliation. This is a separate mount worker's/root's status, not a changed acceptance API or fixture. Preserve the old supplied hash and record current hash; no reconsultation of these four existing-contract cases is triggered. |
| state.md whole-file hash | Same status-sentence change and disposition. Unprovided historical sections were not reconstructed from the old hash. |
| documentation.md whole-file hash | Same status-sentence change. Its other supplied range, lines 50–112, matches the frozen packet exactly. Unprovided historical sections remain outside the comparison. |
| Private system-prompt.txt raw hash | The frozen manifest hashes the exact in-memory UTF-8 CLI argument with LF newlines. Windows text-file writing serialized the private copy with two CRLF sequences. Normalizing that copy through the same text representation reproduces the manifest hash exactly; the raw file hash is separately retained. Five task-local launcher lines confirm the hashed string itself was passed as `--system-prompt`, so neither the supplied rubric nor process argument changed. |
| Task-local ignore comparison | The initial line-delimited comparison reported a mismatch. A NUL-delimited `git check-ignore -z --stdin` check returns all 21 exact private file paths, with zero unignored files. The task-local `.gitignore` is itself covered. No private artifact needs to be staged. |

All six reviewed application/fixture source hashes and all three repository HEADs match the freeze. The common packet, frozen task brief, CLI help/version, all three input/output hashes, model/canonical identities, distinct sessions and opinion files verify. All 23 recommendation dispositions are present, and authored document links resolve. The initial report was generated before these notes and final follow-up, so its artifact inventory is an earlier checkpoint.

The advisory source packet remains 347 physical lines in passes of 166 and 181. Final provenance troubleshooting additionally inspected five noncontiguous lines of the task-created consultation launcher (lines 45, 86, 87, 94 and 110); no application dependency was added. Total source/control lines read for the bounded review and this provenance check are 352, within the 400-line ceiling, with every read pass at most 200. The defect-density denominator remains the 347 reviewed application/fixture lines; the five administrative launcher lines are not a new product review or an opinion input.

The mount-status update was sent to root through orchestration before task completion. Root's separate late Auth/RLS concurrency-pass message remains labelled as root-reported and not independently inspected. Neither update clears full migration/integration readiness. No application check, Docker operation, frontend/backend change or deployment was performed by this worker.
