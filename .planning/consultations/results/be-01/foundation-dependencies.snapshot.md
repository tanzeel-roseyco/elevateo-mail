# BE-01 foundation dependency evidence

Research observed 2026-10-12 Australia/Sydney. This completes a bounded PLAN-RESEARCH selection input; it is not BE-01 consultation acceptance, a build, a vulnerability audit, or runtime compatibility proof. No images were pulled and no application tests were run. Initial Fable 5, Opus 5.5 and Fable 5.1 opinions were consulted, particularly the exact Supabase component-set and hidden Auth SMTP requirements.

## Proposed Ruby toolchain

Use Ruby **3.4.11**, Rails **8.1.4**, and **Steep 2.1.0** as the single Ruby typechecker, with RBS signatures. Ruby 3.4 remains listed as stable; Ruby 4 is unnecessary for this first slice. Rails requires Ruby >=3.2 and Steep >=3.3, so these declared requirements intersect. This establishes resolver eligibility, not successful bundle/native-extension compilation. Lock transitive gems and test in Docker before acceptance.

| Item | Exact evidence | License/maintenance |
| --- | --- | --- |
| Ruby 3.4.11 | [Official downloads](https://www.ruby-lang.org/en/downloads/), tarball SHA256 `5c22be44524312b3d433d68739bcc530633b1da5ef8ba0afa0a37680da17d3de` | [Pinned COPYING](https://github.com/ruby/ruby/blob/v3_4_11/COPYING): Ruby terms or BSD-2-Clause. Downloads lists 3.4 among stable branches. |
| Rails 8.1.4 | [Release](https://github.com/rails/rails/releases/tag/v8.1.4), published 2026-09-24; [gemspec](https://github.com/rails/rails/blob/v8.1.4/railties/railties.gemspec) | MIT. [Maintenance policy](https://guides.rubyonrails.org/maintenance_policy.html): one year bug fixes, two years security from minor-series release; 8.1 released October 2025. Plan its next supported-series upgrade. |
| Steep 2.1.0 | [Release](https://github.com/soutaro/steep/releases/tag/v2.1.0), published 2026-08-27; [gemspec](https://github.com/soutaro/steep/blob/v2.1.0/steep.gemspec) | [MIT](https://github.com/soutaro/steep/blob/v2.1.0/LICENSE); recent release is activity evidence, not an LTS commitment. |

RubyGems API package SHA256 observations: Rails 8.1.4 `5f3ecdf9a2a3b79b2e31b8fee3b64a00f7284d76e5631f87d0e58e665911a33b`; Steep 2.1.0 `1daf53573283b0e6d404a7273cca41fe5c15b14ece05167934f5ffc179e171d9`. Sources: [Rails versions API](https://rubygems.org/api/v1/versions/rails.json), [Steep versions API](https://rubygems.org/api/v1/versions/steep.json). Version-specific `/api/v1/versions/name/version.json` queries returned 404; the list endpoints supplied these records.

Steep is proposed over adding two competing type systems: own RBS for small service/domain/config boundaries, check the application target rather than only a token example, and make untyped framework seams explicit. Rails metaprogramming requires a tested signature strategy; do not call a passing empty target strict coverage. [Steep's own documentation](https://github.com/soutaro/steep/blob/v2.1.0/README.md) describes its RBS-based gradual checking.

## Immutable container references

Use the released Supabase **self-hosted/v0.8.2**, resolved through the official GitHub API to commit **564eab8ad7840b13324f68b1bfac074ef8d51c21**. The [official self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker) currently names that tag. Derive component settings and database initialization from its [pinned Compose source](https://github.com/supabase/supabase/blob/564eab8ad7840b13324f68b1bfac074ef8d51c21/docker/docker-compose.yml), not mutable master or a mixture of old examples.

The following digest values were obtained directly from Docker Hub Registry v2 manifest **HEAD** responses (`Docker-Content-Digest`), accepting OCI indexes and Docker manifest lists. They identify the returned index/manifest, not a verified platform-specific layer set. Use `image:tag@sha256:...`; record resolved target architecture and child digest during implementation.

| Image tag | Observed digest |
| --- | --- |
| `ruby:3.4.11-slim-bookworm` | `sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2` |
| `supabase/postgres:17.6.1.136` | `sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00` |
| `supabase/gotrue:v2.196.0` | `sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232` |
| `supabase/storage-api:v1.74.0` | `sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85` |
| `postgrest/postgrest:v14.17` | `sha256:c9dc201e555f5d8e37e7f39cdd4df0229774996e213bfd7de8d10ac609030f2c` |
| `axllent/mailpit:v1.31.5` | `sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea` |

Registry verification URL shape: `https://registry-1.docker.io/v2/<repository>/manifests/<tag>` (`library/ruby` for Ruby); authorization was a short-lived anonymous pull token, never persisted. A digest is integrity evidence, not publisher-signature or absence-of-vulnerability evidence.

Licenses: [Supabase Postgres](https://github.com/supabase/postgres/blob/develop/LICENSE) reports PostgreSQL license for its repository; [Auth v2.196.0](https://github.com/supabase/auth/blob/v2.196.0/LICENSE) MIT; [Storage v1.74.0](https://github.com/supabase/storage/blob/v1.74.0/LICENSE) Apache-2.0; [PostgREST](https://github.com/PostgREST/postgrest/blob/main/LICENSE) MIT; [Mailpit v1.31.5](https://github.com/axllent/mailpit/blob/v1.31.5/LICENSE) MIT. The two default-branch license URLs are weaker evidence and must be bound to the image's actual source revision/SBOM before distribution. Image OS packages/extensions have their own notices; repository license is not a complete image license bill. [Mailpit 1.31.5](https://github.com/axllent/mailpit/releases/tag/v1.31.5) was published 2026-10-11. Supabase's jointly versioned self-host release is maintenance/integration intent evidence, not a promise each included upstream version has no advisories.

## Minimal service graph and adaptation boundary

Proposed local foundation: **Postgres + Auth + PostgREST + Storage + Mailpit**, alongside the same Rails image running separate API/worker commands. Rails connects directly through separate restricted runtime roles; migration credentials are not runtime credentials. Keep Supabase's service-owned schema bootstrap and dedicated Auth/Storage roles distinct from application migrations.

- Auth depends on healthy Postgres and delivers its local SMTP to Mailpit.
- PostgREST depends on healthy Postgres. Keep it private; the official Storage configuration references it, so deleting it to obtain a four-service graph is not justified by this audit.
- Storage depends on Postgres/PostgREST and uses a persistent file volume. Set `STORAGE_BACKEND=file`, bounded upload size and private buckets. It is real Supabase Storage, not an in-memory substitute.
- Omit imgproxy only with `IMAGE_TRANSFORMATION_ENABLED=false` (legacy alias `ENABLE_IMAGE_TRANSFORMATION=false`) and remove its Compose dependency. The [pinned Storage configuration](https://github.com/supabase/storage/blob/v1.74.0/src/config.ts) explicitly gates transformations. This reduced graph still needs real upload/download tests.
- Studio, Realtime, Edge Runtime, analytics, metadata UI and Supavisor are not needed by this bounded slice. Use Rails's own direct connection pool; retain the pool-size-one cross-user claims test. The official guide permits removing unused services and dependencies.
- A Supabase gateway is unnecessary **only if** Rails is the sole public application origin and intentionally proxies the required Auth/Storage operations to private services with tested path/issuer behavior. If direct Supabase browser/native SDK access is chosen, add the released gateway and routing configuration; do not accidentally expose internal services or pretend removing the gateway preserves `/auth/v1` URL semantics.

This is a proposed derivative Compose profile, not an upstream-supported claim that five unmodified containers form a drop-in Supabase distribution. Upstream currently uses Envoy, not older Kong examples. Preserve source provenance for adapted initialization SQL/configuration, generate ignored local secrets, and inspect those SQL files before running them.

## Local Auth and no-live-send enforcement

Set `GOTRUE_DISABLE_SIGNUP=true`, retain email authentication, disable phone/OAuth/external hooks, and provision synthetic invited users through a bounded administrative seed path. Set `GOTRUE_MAILER_AUTOCONFIRM=false` so invite/recovery verification genuinely reaches the local catcher. Auth SMTP must be exactly `mailpit:1025`, with a synthetic sender and local-only redirect allowlist. Do not install production SMTP/provider keys in this profile. The pinned Compose source above documents these Auth options.

[Mailpit options](https://mailpit.axllent.org/docs/configuration/runtime-options/) include relay, forwarding and webhook paths: leave **all** relay/forward configuration and relay matching unset, explicitly keep relay-all false, disable reverse-DNS lookups, and leave outbound webhook unset. A catcher alone does not establish egress denial.

Enforce an internal Docker network for runtime services, no external-network attachment for Auth/worker/catcher, and explicit loopback-only ports for human preview where necessary. Image acquisition/build occurs separately from runtime. Validate configuration at startup and fail closed if local mode receives a non-local SMTP/provider endpoint. Demonstrate blocked outbound TCP/HTTP in the actual topology, plus captured invite/recovery mail and no relay. Never interpret labels such as “development” as a security boundary.

## BE-01 acceptance evidence still required

1. Resolve lockfiles and target-platform images; collect SBOM/advisory evidence and image source/license mappings. No advisory scan occurred here.
2. Build the Rails API and worker once; run Steep and appropriate lint/tests inside Docker.
3. Bootstrap actual Supabase schema/roles, authenticate two synthetic users, capture recovery mail, upload/download a private object, and reject cross-user access through restricted roles.
4. Confirm current Auth session revocation and transaction-local RLS claims with a pool of one, including missing-claims failure; successful JWT decoding alone is insufficient.
5. Prove local-mode egress denial, persistent storage after restart, and failure on missing/invalid configuration. Record measured memory/disk needs for the reduced graph; upstream full-stack sizing is not a measurement of this profile.

No Docker storage was created by this research, so no task-owned image/container/cache cleanup was necessary.
