# How this repository was consolidated

On 2026-10-30 all Elevateo Mail work was brought into this one repository. Before then, the project was spread across
about 50 folders under `C:\Users\Tanzeel\Code and projects`, an Orca worktree, two folders on fleet-02, 47 git bundles
and 81 GitHub branches. They were produced by many parallel agents between 2026-10-01 and 2026-10-30.

## What was collected

| Kind | Count | Where it went |
| --- | ---: | --- |
| Git repositories and worktrees | 22 repositories (38 checkouts, including worktrees) | Every branch and remote ref imported; see [source-map.md](source-map.md) |
| Uncommitted changes | 20 worktrees | Committed as snapshots without touching the originals, under `archive/uncommitted-20261030/*` |
| Git bundles | 47 | Imported; unique lines under `archive/bundles/*` |
| GitHub branches | 81 | Fetched; unique lines under `archive/<original name>` |
| Non-git folders (evidence, screenshots, launch records) | 29 folders, 12,741 files | Packed as release assets; see [artifacts.md](artifacts.md) |
| Orca sidebar | 18 projects | Screenshot before cleanup: [orca-sidebar-before-consolidation-20261030.png](orca-sidebar-before-consolidation-20261030.png) |

## How main was built

1. The newest integrated line was `Tanzeel/elevateo-emailguard-fable`. It held Authentik SSO, organisation threads,
   IMAP, send review, self-hosted Mox and production initialization (to 2026-10-24). Its 166 uncommitted files were
   committed in five atomic commits (`883c42a3`..`c1ac27bd`).
2. Three completion branches cut from `c1ac27bd` were merged into it:

   | Merge | Branch | Contents |
   | --- | --- | --- |
   | `edecc6cf` | `feature/email-finder` | Email finder module |
   | `eedd0025` | `feature/frontend-completion` | Web, macOS, Windows, Android and iOS clients |
   | `487987eb` | `feature/backend-completion` | Authentik, Resend, Mox, MCP, native bridge, deployment |

   Conflicts were confined to documentation, `featureGateways.tsx`, `ops/production/compose.yaml`,
   `.env.production.example` and `docs/credentials-last.md`. Each was resolved by keeping both sides. For Compose,
   the backend's complete stack was taken and the `email-finder-worker` service added.
3. Every branch tip not already contained in that line (97 of them) was given an `archive/` branch. All were then
   recorded as merged by one merge commit, `1872ba29`, using the `ours` strategy. The `main` tree stays the tested product,
   and every archived line is an ancestor of `main`.
4. Documentation was reorganised: new README, AGENTS, state and documentation files, a documentation index and this history.
   The previous append-only logs moved verbatim to [logs/](logs/).

## Was anything left out of main's tree?

Each archived line was compared with `main` file by file. Every application file present in some line but absent from
`main` turned out to have been deliberately replaced later:

| File | Replaced by |
| --- | --- |
| `apps/server/lib/elevateo/inbound/imap_attachment_parser.rb` | `imap_mime_parser.rb` / `imap_mime_tree.rb` (commit `d4a5ccee`) |
| `apps/web/src/features/auth/GoogleMark.tsx` | Removed with Google sign-in (Authentik only) |
| `apps/web/src/app/AccountSheet.tsx` | The 2026-10-20 settings redesign (`f8f52529`) |
| `apps/native/macos-unsigned-candidate.sh`, `test_macos_packaging.py` | `apps/native/macos-release.sh` and its tests |

The remaining files absent from `main` are historical: run evidence, staging copies, agent task records and the original
Cloudflare-based prototype (`src/` at the root of the oldest branches). They are preserved on their archive branches.
The mail-server R&D team notes and coordination records were also copied into [mailserver-rd/](mailserver-rd/),
next to the design documents in [../mailserver/](../mailserver/).

## Finding old work

```sh
git branch -a --list 'archive/*'                 # every preserved line
git log --oneline main -- <path>                 # a file's history across all merged work
git log --all --oneline -S'<text>'               # search every line for a change
git switch -c look archive/<name>                # inspect an archived line (never commit to archive/*)
```

## Known gap

fleet-02 could not be reached on 2026-10-30, so anything committed there after its last local fetch is not
included. See [state.md](../../state.md) item 7.
