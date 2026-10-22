# Initializer source-admission final bounded review

Task `task_8a3cac2b6fff`; dispatch `ctx_1b2c58c62557`; initializer owner `ctx_f5eab65ab665`.

Result: **0 confirmed actionable defects; 206 unique physical lines; 0 defects/KLOC**. Source review only; no production authorization or runtime PASS.

## Exact coverage

Verified complete-file SHA-256 and physical lengths against `ops/production/initialize/review-packets-initrepair.json` before review. Blank lines and comments count toward coverage.

| Packet | File | Inclusive range | Physical lines | SHA-256 |
| --- | --- | --- | ---: | --- |
| A | `ops/production/initialize/admission.py` | 1–115 | 115 | `77521674eab0cdb3bca05e84075d79f117e38f5112241ab2cf1f82c234a5e8a8` |
| B | `ops/production/initialize/test_source.py` | 1–91 | 91 | `a5f94f5d7829356db38559894f8fd270a846c5965d75917974f26c13d66cf212` |

Each packet is below 200 physical lines; combined unique coverage is 206, without imported implementation or additional tests. Both packets have zero confirmed defects and 0 defects/KLOC individually. This report covers the latest admission hash rather than inheriting the older initializer review verdict.

Context: AGENTS.md, .planning/STANDARDS.md, README.md/state.md/documentation.md context, initializer README and prior initializer review. Large combined historical documentation output was truncated; exhaustive historical reconciliation is not claimed.

## Mandatory rubric checklist

- **Purpose and correctness:** `source_digest` requires an absolute existing non-symlink root, validates paths against its resolved root, and hashes sorted checkout-relative names plus file content digests. Exclusion matching uses relative path components, so staging beneath `/tmp`, `log`, `.bundle` or `__pycache__` no longer silently removes the checkout from the binding. Hashing remains location independent while binding renames and content changes.
- **Empty inputs, boundaries and limits:** migration admission requires at least one direct `*.rb` migration and requires every selected migration to be a nonempty regular file. Each named bootstrap, Gemfile/lock and initializer input must exist and be nonempty. Missing/empty source directories fail. Gate files are bounded to 16 KiB; tenant UUID/name/role/receipt checks and evidence identity checks fail closed in inspected code. Malformed JSON/types may raise parsing/type exceptions rather than a uniform validation exception; no success bypass was identified.
- **Symlink and authorization boundary:** `checked` rejects symlinks in selected descendants and their ancestors within the checkout before accepting resolved containment. It is called on migration and source-directory entrypoints before enumeration and on every enumerated descendant. Required files receive the same checks. Gate phase/target/source, literal-true attestations, four nonempty evidence artifacts and exact tenant fields are bound. This does not independently establish actual database identity, authorization of the operator or truth of attestations.
- **State and cross-system effects:** admission computes digests and reads gate/evidence data; it performs no database mutation. No accidental shared-state mutation was found. Execution, SQL, migration bodies and caller behavior were outside this assignment, so downstream correctness is not certified.
- **Scope, complexity and responsibility:** functions retain focused admission/parsing/hash responsibilities. Shared path validation avoids duplicated containment logic; deterministic deduplication avoids hashing required files twice. No actionable over-engineering, misleading names, excessive nesting or unnecessary abstraction was found.
- **Comments and documentation:** the checkout-relative exclusion anchor explains the staging-root hazard; the evidence anchor explicitly distinguishes identity from accepted restore proof. Initializer documentation requires a read-only complete checkout, protected external evidence, independent reviews and isolated restore acceptance. No source comment change was requested or made.
- **Tests and failure scenarios:** inspected regressions cover nonempty valid checkout hashing, equal content at different roots, relative-name binding, ancestor names matching exclusions, genuine relative cache exclusion, absent source, missing/empty Gemfile, missing/empty migration, directory symlinks and leaf symlinks. They assert failures and observable hash equality/inequality rather than implementation internals. Bootstrap-empty and root-symlink branches are not individually exercised in this test packet; the same inspected required-file validation covers bootstraps. Other tests were not read, so no claim of suite-wide coverage is made.
- **Performance and security:** file contents are streamed in 1 MiB blocks; no database queries, secret values or log disclosure appear in these packets. Enumeration and sorting are proportional to the trusted checkout and appropriate for an offline operator action. Formatting checks belong to linters and were not reviewed.

## Evidence limits and remaining acceptance

No tests, builds, secret access, cloud/DNS access, database calls, nested workers or imported-source inspection were performed. Only this assigned report was written. No Docker resources were created, so cleanup was unnecessary.

The documented immutable/read-only source mount remains necessary: path checking and later file reads are separate operations and do not defend against concurrent checkout mutation. Evidence hashes similarly prove bytes, not the truth of operator attestations. These are documented operational prerequisites rather than newly confirmed defects under this assignment.

Coordinator-owned next steps are exact-hash fleet Docker regression execution, any separately assigned deeper design/SQL/migration review, and isolated restore acceptance. This report does not certify initialization, complete application acceptance or release readiness. Findings were sent promptly to the coordinator and corrected initializer owner dispatch.
