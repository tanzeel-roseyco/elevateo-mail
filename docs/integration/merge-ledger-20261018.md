# Merge ledger — integrate/unified-20261018

Integration branch `integrate/unified-20261018`, built on fleet-02 from `fix/inline949-completion-recovered` (712a3cbf). Every branch of the canonical repository that was not an ancestor of that line was judged by behaviour, not by text diff: for each changed source file the branch-added lines were checked against HEAD's copy, and where they differed the HEAD implementation was read to confirm it is the same behaviour or a later revision of it.

Decisions: **MERGE** = behaviour missing from HEAD, merged with conflicts resolved; **SUPERSEDED** = behaviour already in HEAD (evidence cites the file); **DROP** = abandoned attempt. Review and completion records that existed only on superseded branches were preserved as plain file adds in commit `c518196f` (44 files under `docs/completion/`, no source change) so no written decision is lost.

Totals: MERGE 3, SUPERSEDED 28, DROP 0. Historical laptop lines listed at the end are not merged.

## Merged

| Branch | Tip | Decision | Evidence / resolution | Commit |
|---|---|---|---|---|
| `wip/fleet-integration-snapshot-20261018` | 2f769b92 | MERGE | Snapshot of the uncommitted fleet working tree over base 2f9c7e50. Source was identical to HEAD's recovered commits except HEAD carries three extra test files (`apps/server/test/attachments/private_storage_test.rb`, `service_test.rb`, `be_02/session_security_test.rb`), which were kept. Six conflicts (`.planning/STATE.md`, `code-reviews.md`, `docs/mailserver/readiness.md`, `documentation.md`, `obsidian.md`, `state.md`) were HEAD-empty against the snapshot's `completion-wave-current` authoritative block; the snapshot side was taken. A duplicated RESEND-FIRST paragraph in `README.md` was removed. `docs/completion/resend-first-launch.md` added. Stray `ops/tests/**/__pycache__/*.pyc` binaries from the snapshot were not added. | acf94f22 |
| `completion/orion-fix939` | 07411a15 | MERGE | Clean merge (+8 lines, docs only); its `ops/tests/be02/test-suites.sh` change was already in HEAD. | a6e8b881 |
| `completion-rhea-mail818` | 2938eb75 | MERGE | Isolated Mox localserve / IMAPS interop pilot fixture `ops/mail/mox-pilot/` (compose, probes, `scripts/run-pilot.sh`, runner receipt test) and `docs/completion/rhea*.md` existed nowhere in HEAD. Self-hosted Mox is deferred (Resend-first, 2026-10-17) so the fixture is preserved, not executed, and is not wired into any application gate. Conflicts in `code-reviews.md` and `state.md`: HEAD files kept, the 14 + 9 branch-only MAIL-818 lines appended under a dated heading. | de244e9f |

## Superseded

Line counts read "present/added": branch-added non-blank source lines found verbatim in HEAD. Where the count is below 100 % the cited HEAD location is the later revision of the same behaviour.

| Branch | Tip | Decision | Evidence | Records preserved |
|---|---|---|---|---|
| `completion-astrid-apk813` | d3a758ba | SUPERSEDED | `apps/android/verify_manifest_tree.py` 40/40, `verify_permissions.py` 49/49, `verify_unsigned.py` 26/26, `ops/build/android/build-unsigned.sh` 14/14, Dockerfile 2/2. The one test rename is `apps/android/test_verify_permissions.py:21` (`test_allows_network_state_internet_and_androidx_signature_receiver`). | `astrid-androidx-permission-review.md` |
| `completion-celeste-fe807` | c1d29c2a | SUPERSEDED | `apps/web/src/features/outreach/SequencePage.tsx` 106/106, `sequenceContract.ts` 34/34, `SequencePage.test.tsx` 71/71. `featureModule.tsx:5` loads the page through `lazy()` instead of a static import (later revision). | — |
| `completion-corin-mail819` | 6d08c0ea | SUPERSEDED | Branch file `lib/elevateo/inbound/imap_attachment_parser.rb` is absent by name, but its behaviour lives in `apps/server/lib/elevateo/inbound/imap_mime_parser.rb`, and `imap_ingress.rb:4,25-45` goes further: it stages each parsed attachment through `attachment_storage.put_once` and fails closed when storage is absent. Migration `20261015000017_add_imap_attachment_ingest.rb` 86/86, `fake_inbound_controller.rb` 15/15, `imap_attachment_database_test.rb` 52/52. `application_controller.rb:7-9` is the nil-safe superset of the branch's logger fallback. | — |
| `completion-dorian-out804` | 3436ac63 | SUPERSEDED | Migration `20261013000009_create_campaign_foundation.rb` 24/24, `migration_policy_test.rb` 15/15. `test/campaigns/authorized_database_test.rb:79-84,106` reworked the `elevateo_app_read` role tests into the protected-api-role model (`pg_has_role` assertion). | — |
| `completion-elara-send811` | a447e7cf | SUPERSEDED | `send_intents_controller.rb` 3/3, `db/sec802/access.sql` 10/10, `smtp_transport.rb` 3/3, membership/access tests 100 %. `send_worker/drain.rb:9-24` is the later revision (validated finite `idle_delay`, `max_seconds.to_f`). | `elara-fix947.md`, `elara-rev846.md`, `elara-rev906.md`, `elara-rev922.md` |
| `completion-felix-qa817` | c3d3ac58 | SUPERSEDED | No source changes (16 doc files). Its QA-817 suites are in `apps/server/test/qa817/`. | 10 `felix-*.md` review records |
| `completion-leonie-ops820` | 6db12e58 | SUPERSEDED | `ops/ops820/*` 20 of 22 files 100 %; `full-runner.sh:33,71` handles migration 20261015000018 through `required_versions`; `restore-rehearsal.sh:9` / `source-snapshot.sh:10` carry the pinned-image guard with a reworded message. | — |
| `completion-lyra-fe808` | f0cd5a2b | SUPERSEDED | `PersonalSettingsPage.tsx` 85/85, `AssigneePicker.tsx` 148/148, `AssignmentPanel.tsx` 5/5 and both tests 100 %. | `lyra-rev852.md`, `lyra-rev853.md`, `lyra-rev875.md`, `lyra-rev892.md` |
| `completion-maeve-mac814` | 45d93af7 | SUPERSEDED | Outreach sequence backend (`outreach_sequence/{draft_input,repository,schedule}.rb`, RBS, tests) 100 %; migration `…16_create_outreach_sequences.rb:121-129` has the same irreversible-when-populated guard. The branch's shell-side origin hardening and `--unsigned-candidate` DMG mode (2026-10-14) were replaced on 2026-10-15 by commit 174cfcc7: origin placeholder/trailing-dot/IP rejection moved into the Rust launch validator `apps/native/src-tauri/src/config.rs:50-52` (tests `:117-127`), packaging preflight became `apps/native/test_macos_release.py`, and provenance is the `ELEVATEO_NATIVE_ARTIFACT=unsigned-candidate` marker in `macos-release.sh` (see `apps/native/README.md` "macOS overlay"). Follow-up: the credential-less `cargo tauri build --no-sign` candidate path was not carried into that redesign. | `maeve-lyra-f0cd5a2-review.md`, `maeve-native942.md`, 3 more `maeve-*.md` |
| `completion-mira-fe806` | 20e8c46e | SUPERSEDED | `MessageAttachments.tsx` 134/135 (`:39` uses `hasForbiddenCodePoint()` instead of the inline regex), `ThreadPage.tsx` 32/32, tests 100 %. | `mira-app900-inbox-inventory.md`, `mira-col910.md`, `mira-rev851.md`, `mira-review-nadia-8d89a18.md` |
| `completion-nadia-send810` | 83ca3dd1 | SUPERSEDED | Migration `…15_create_inbox_attachments.rb` 179/179, `attachments_download.rb` 25/25, `attachments_scan.rb` 119/120, controller 141/143, tests 100 %. `attachments_storage.rb` in HEAD is the later hardened revision (`Timeout.timeout` exchange deadlines, `ignore_eof = false`, `DRAFT_KEY`, duplicate 400/409 handling, redacted `inspect`). | `review-nadia-dorian-2d191f7-consent-replay.md`, `review-nadia-maeve-b3204ce-sequence-read.md` |
| `completion-orion-native812` | 69521559 | SUPERSEDED | No source changes. | `orion-native945.md` |
| `completion-rowan-send809` | 58bb7194 | SUPERSEDED | No source changes; its docs already exist in HEAD. | — |
| `completion-sabine-sec802` | 33ff06b6 | SUPERSEDED | `apps/server/attachment_gateway/{app,authority,protocol,puma}.rb`, `config.ru`, migration `…18_create_attachment_gateway_binding.rb` and `app_test.rb` 100 %; two tests differ only by line wrapping. | — |
| `completion-soren-qa815` | f1a11b39 | SUPERSEDED | 11 runners in `ops/tests/qa815/` (web/android/backend candidate, acceptance list, aapt, mock probe, ops820 python, seeded visual, focused steep) are in HEAD; the browser private-output mode check is reimplemented in `ops/tests/be02/acceptance_runtime.py:186-208`. Eight wave-bound diagnostic runners (`run-fix948-cause.sh`, `run-focused-{feature,fix948,inbound}.sh`, `run-qa816-seed-unit.sh`, `run-real-clamd.sh`, `run-rubocop-diagnostic.sh`, `run-v2-codegen.sh`) and extra `run-backend-candidate.sh` focus modes were not imported on 2026-10-14 (HEAD's copy diverged with its own `QA815_ELARA_FOCUS` / `QA815_GATEWAY_*` modes); they lock on `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock` and their evidence is already recorded, so they stay on the branch. The 1,600+ `docs/completion/qa815-evidence/` raw logs were not copied. | — |
| `completion-tessa-qa816` | 396aa0f3 | SUPERSEDED | `tests/acceptance/playwright/qa816-*.e2e.ts` 100 %, `qa816-later-page-seed.rb` 83/83, `screenshots.ts:34-35` holds the two names on different lines. | `tessa-app901-904-acceptance.md`, `tessa-visual-f210.md`, `tessa-visual-f70.md` |
| `completion-theo-adm803` | 54b44014 | SUPERSEDED | V2 admin controllers, `assignee_options*.rb`, RBS and tests 100 %; migration `…14_create_user_display_preferences.rb:67-81` serializes first writes with `FOR UPDATE` on the membership row (equivalent lock). | 7 `theo-*.md` records |
| `completion/cassian-int801-core-gate` | e3ba005d | SUPERSEDED | All 10 source files 100 %. | `nadia-strict909-index.md` |
| `completion/fable-fe805` | df858c09 | SUPERSEDED | 31 files incl. `generated/api-v2.d.ts` 971/971, v2 gateways and tests 100 %; remaining lines are test formatting. | — |
| `completion/nadia-fix933` | b3899a06 | SUPERSEDED | 3/3 files 100 %. | — |
| `completion/nadia-fix938-qa816` | be921687 | SUPERSEDED | `tests/acceptance/qa816-attachments-seed{,-test}.rb` 100 %. | — |
| `completion/nadia-lint909` | 200fc016 | SUPERSEDED | 4/4 files 100 %. | `nadia-strict909-index.md` |
| `completion/nadia-qa816-attachment-seed` | 2e1cc302 | SUPERSEDED | Earlier revision of `nadia-fix938-qa816`; 224/227 (heredoc wrapping). | — |
| `completion/nadia-strict909-215080` | 3f3562a6 | SUPERSEDED | 3/3 files 100 %. | `nadia-strict909-index.md` |
| `completion/orion-authority-syntax` | 1aebd99b | SUPERSEDED | 8/8 files 100 % incl. `ops/tests/be02/test-suites.sh`. | `nadia-strict909-index.md` |
| `completion/rhea-smtp888` | daad8af1 | SUPERSEDED | `smtp_transport_test.rb` 7/7; the RBS differs by one comment line. | `rhea-qa816-hi-review.md`, `rhea-rev921.md` |
| `completion/sabine-att883` | afdf997e | SUPERSEDED | 3/3 admin controllers 100 %. | — |
| `completion/sabine-dir903` | bd1969ae | SUPERSEDED | `db/directory/assignment_member_options.sql` 63/63, migration 13/13, tests 100 % (one assertion reflowed). | — |
| `completion/sabine-lint-gateway` | 28ef4d56 | SUPERSEDED | 7/7 files 100 %. | `nadia-strict909-index.md` |

## Historical (not merged)

Preserved on GitHub as `wip/*-snapshot-20261018` branches; they predate the fleet integration line and are listed for traceability only: `feature/frontend-prototype`, `feature/application-integration`, `feature/backend-foundation`, `design/fable-frontend`, `feature/local-completion`, `review/ultra/*`, `feature/codex-be02-*`, `perf/fable-5-1/backend-speed`.

## Verification

See `state.md` "Integration branch" entry for the gate results of the final HEAD; the commands are the repository's own runners: `docker build -f apps/web/docker/test.Dockerfile` + `docker run` (API checks, lint, typecheck, unit tests with coverage, build, fixture-marker check) and `python3 ops/tests/be02/run.py --context default --expect-host <fleet host>` (backend suites, Steep, RuboCop in disposable compose).
