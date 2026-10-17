# BE-02 C/D contract generation

The frozen `1.0.0-collaboration.1` contract generated successfully twice in separate Docker containers on fleet-02. `cmp` returned 0, and both outputs have SHA-256 `bb43a39e6fb514268ab9b89e1b443edb752f6e6eb3a7b0c87468cae5a75b077a` (129,531 bytes, 2,827 lines). All four canonical `contracts/v1` files and the generated types were copied to both consumers and verified by SHA-256.

This proves deterministic type generation and delivery. Fixture-schema conformance, application typechecks/tests, and real API acceptance were not executed or proved by this task.

<!-- AIDEV-NOTE: Generation and file integrity are separate from fixture-schema and endpoint acceptance. -->

## Inputs and execution

| Input | SHA-256 |
| --- | --- |
| `contracts/v1/openapi.json` | `859041382484a3a001ae087ca88e02eeb23540f2cf46aec795b064aa8ea66073` |
| `contracts/v1/fixtures.json` | `182d8dfad62c49d3a5b9eba836716808709255c66320e3a8a09fc4e7ddae2833` |
| `contracts/v1/README.md` | `24592cbb5a42e269dc85e813d72d06ebaee6b856c56826a02e3df94912e5ddb2` |
| `contracts/tooling/package.json` | `38c232b37479b0a5459c1ba63f83291dc4f8e9caf57e17fac7b1b383ef4ff56d` |
| `contracts/tooling/package-lock.json` | `65132a7eaded1decac12c44f001b0cd1c9deb7c07694ed2cc05a38afb7200a74` |
| `docs/completion/be02-cd-contract.md` | `2f37e8ecb60f40a17ab2e1f6edbbda64bf5f0312c38c55161f20f6abde87426e` |

The frozen OpenAPI, fixtures, handoff, README, and package files were left unchanged and checked again before consumer synchronization. The source archive contained only the first five files above; no credentials or application environment files were included. The contract inventory is 22 paths, 26 operations, and 53 schemas.

Local Docker was unavailable, so execution used the explicitly authorized fleet-02 host. Preflight verified hostname `Ubuntu-noble-latest-amd64-base`, Docker context `default`, and endpoint `unix:///var/run/docker.sock`. The cached image was `node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`; the actual runtime reported Node `v24.21.0` and npm `11.19.0`.

Each run used `--rm`, a unique name and task label, one CPU, 1 GiB memory/swap limit, a read-only root filesystem and source bind, a non-root UID/GID, dropped capabilities, no new privileges, and no published ports. Working files and npm caches lived in fresh tmpfs mounts. No Docker build or image pull was needed.

In each container, the existing lock installed with `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/npm`, then `npm run generate:web` ran the pinned `openapi-typescript 7.13.0`. Package definitions and dependencies were not changed.

| Run / check | UTC | Exit |
| --- | --- | --- |
| Generation 1 | 2026-10-12 22:29:01–22:29:04 | 0 |
| Generation 2 | 2026-10-12 22:29:04–22:29:07 | 0 |
| `cmp out1/api.d.ts out2/api.d.ts` | After generation 2 | 0 |
| Complete remote script, including cleanup checks | After comparison | 0 |

## Validation boundary

No existing generic fixture-schema validator was found in `contracts/tooling` or the first-party `scripts` directory. The tooling contains the generator package, lock, and README; scripts cover upstream snapshot intake. The lock's transitive Ajv dependency is not an existing validation harness. Application-owned FE Zod/conformance tests and backend acceptance tests exist, but fall outside this dispatch's permitted tooling changes and were neither edited nor run.

| Canonical fixture group | Concrete fixtures | Schema validations run |
| --- | ---: | ---: |
| `examples` | 17 | 0 |
| `lifecycle_examples` | 3 | 0 |
| `cd_requests` | 8 | 0 |
| `cd_examples` | 41 | 0 |
| Total | 69 | 0 |

The 10 read scenarios, 17 lifecycle scenarios, 36 C/D scenarios, and eight C/D boundary recipes were inventoried, not executed. An authorized validation owner still needs to cover all four fixture groups and real endpoint behavior. The updated contract lock explicitly retains the pending fixture and API conformance state.

## Consumer synchronization

At 2026-10-12 22:31:43 UTC, the four files in `contracts/v1` and `apps/web/src/data/generated/api.d.ts` were copied and hash-verified in:

- `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`
- `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Fable FE01 R1`

Other consumer files were preserved. The copied lock SHA-256 is `98b7379b024b639b22ef757552da859a5e7151d41b039ef17a3d5d7ccf9f2a07`. Coordinator readiness notification `msg_b4fa07ae8fb8` was enqueued at 22:31:51 UTC, explicitly identifying Fable's C/D contract availability and the remaining validation limits.

## Cleanup and retained evidence

Both disposable generation containers were removed automatically, destroying their tmpfs dependency installations, working directories, and npm caches. Cleanup checks found zero task containers, volumes, or images remaining. No images, volumes, or build caches were created; the shared pinned Node image and other workloads were preserved. No broad prune or Windows Docker/WSL disk operation ran.

The cleanup free-space samples were 269,952,741,376 bytes before and 269,952,405,504 bytes after, a shared-host delta of -335,872 bytes. This is not an attributable reclamation measurement: temporary work used memory and the host has concurrent workloads. Docker inventory remained 104 images, 303 containers, 247 volumes, and one existing cache entry. Exact Docker usage and separate `df` samples are in the evidence JSON.

The source archive, outputs, command script, logs, container IDs, timestamps, hashes, and cleanup records are retained under `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be02-cd-35bdb90899b24281bbecff35beb5ad35/` and the ignored local `.env.be02-cd-35bdb90899b24281bbecff35beb5ad35/` staging directory. [The durable evidence](../evidence/be02-cd-contract-generation.json) embeds the exact remote script and relevant logs, plus before/after consumer file hashes. No application implementation, root-state edits, commits, publication, new agents, or paid sessions were performed.
