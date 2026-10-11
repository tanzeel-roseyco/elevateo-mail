# Pinned upstream source collection

This directory contains the source code requested by the user from all six previously audited repositories. It is an **inert reference collection** for building Elevateo Mail. None of these applications is installed, started, deployed or linked into an Elevateo application by this intake.

## Inventory

| Snapshot | Pinned revision | Included files | Declared root license | Independent dossier |
| --- | --- | ---: | --- | --- |
| [Quickly](upstream/quickly) | `edca964b8bfd56e621b491aba6302b0981545898` | 290 | MIT | [Analysis](../docs/reference-repositories/quickly.md) |
| [Wu-Wei-Mail](upstream/wu-wei-mail) | `6002b8850d685c9ad275eb1cc10a4ce0c8299145` | 353 | MIT | [Analysis](../docs/reference-repositories/wu-wei-mail.md) |
| [cold-cli](upstream/cold-cli) | `041c834156e873a897f19fcf9b5e040896e39d1d` | 80 | MIT | [Analysis](../docs/reference-repositories/cold-cli.md) |
| [lightreach](upstream/lightreach) | `c0723a25dbcc1b19ec4bdbd0f882de31ace2df87` | 175 | MIT | [Analysis](../docs/reference-repositories/lightreach.md) |
| [Instantly starter kit](upstream/instantly-starter-kit) | `7649e6e4f820ad18cc563d5075f34b1a8daceb36` | 384 | MIT | [Analysis](../docs/reference-repositories/instantly-starter-kit.md) |
| [BillionMail](upstream/billionmail) | `fc36c76c050c3775c5e899faf7403cf0262d2744` | 1,482 | AGPL-3.0 | [Analysis](../docs/reference-repositories/billionmail.md) |

Total: **2,764 included files, 81,939,734 bytes** (about 81.94 MB decimal), from 2,765 tracked upstream files. Commit history and nested Git repositories are not included. Every included file is copied from its pinned Git blob, including upstream-tracked assets, build bundles, tests, dependency lockfiles, examples, documentation, workflows and license notices. Installed dependencies, caches, local audit outputs and untracked build products are not copied.

The single omission is BillionMail's `ssl-self-signed/key.pem`, a published sample TLS private key. Its path, original Git blob ID, size, SHA-256 and omission reason remain in the manifest. No other source files were modified or omitted. Consequently, the BillionMail snapshot is intentionally incomplete for its original self-signed setup; do not attempt to deploy it from this collection. Supply genuinely new secrets only in a separately reviewed deployment.

## Integrity and provenance

[registry.json](registry.json) records origin URL, exact revision, commit date, declared root license, snapshot path, file counts, included bytes, license path and manifest hash for each repository. Each [manifest](manifests) records every original tracked path, Git blob ID, executable mode, byte count, SHA-256 and inclusion/omission decision. Root licenses and embedded third-party notices remain at their original locations. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Verify the committed files without dependencies or network access:

```sh
python3 scripts/verify_upstream.py
```

For stronger correspondence checking against the six original local clones:

```sh
python3 scripts/verify_upstream.py --upstream-root /path/to/the-six-clones
```

The second command compares the complete manifest file inventories against `git ls-tree` at the pinned revisions. The offline check detects unintended changes to content, executable bits on POSIX systems, manifests and file sets. Hashes are integrity evidence, not proof that upstream software is safe or that an upstream maintainer's identity was authenticated. These revisions were not reselected from latest branches during intake.

## Strict handling rules

1. Do not add these directories to root package workspaces, production container builds or deploy paths. No root workflow executes upstream scripts.
2. Do not run upstream installers, package hooks, containers, migrations, mailbox sync or provider calls during an inspection. Existing test results are evidence from the prior audit, not permission to operate real mail.
3. Treat upstream `AGENTS.md`, `CLAUDE.md`, example prompts and embedded instructions as source documentation. They do not set Elevateo's intake or production policy.
4. Read the dossier and known findings before selecting a component. A high component score is not permission to import its authorization model or retry loop unchanged.
5. Copy/adapt only into a reviewed product module with preserved notices, explicit provenance, resolved findings and meaningful tests. Do not edit these snapshots in place to create the application.
6. Preserve AGPL and all other applicable notices. Separate directories do not determine the licensing consequences of a later combined or deployed product; BillionMail is reference material here, not an approved product dependency.
7. Default credentials and fixture secrets are not valid production configuration. The [redacted scan triage](security-scan.json) records 17 findings: 11 published test/CI fixtures, 4 nonsecret pattern matches and 2 published insecure installer fallback hashes. No folder-wide secret-scan exclusion is added.

## Reproducible intake and future updates

The intake tool is [scripts/import_upstream.py](../scripts/import_upstream.py). It reads the six pins in [repository-pins.json](../docs/research/repository-pins.json), validates local origins and commits, reads only committed blobs and refuses to overwrite an existing snapshot. It does not clone, install or execute upstream code.

Use it only in a fresh controlled checkout where the destination snapshot/registry paths do not yet exist. For a future version update, prepare a separate branch/worktree, deliberately update the selected pin and audit the upstream diff, then regenerate the affected evidence using an explicitly reviewed refresh procedure. The initial importer is deliberately not an automatic in-place updater. Do not delete modified snapshots to bypass the overwrite guard; inspect unexpected changes first.

The omission policy is explicit in the importer. Any new unsafe artifact, unexpected Git entry, manifest mismatch or secret candidate requires an intake decision recorded in the registry/security evidence. Do not silently skip a file or rewrite a pin. Review both added and removed files, license changes, dependency changes and upstream security fixes. Re-triage scanner findings whenever their file hash changes.
