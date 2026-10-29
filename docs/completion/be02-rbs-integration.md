# BE02 Ruby/RBS framework integration

Prepared in the existing BE02 Codex checkout for task `task_5a55825201ef`, dispatch `ctx_e50441dbf7c1`.
Status: implementation and static inspection complete; **RBS validation, Steep, application tests and lint NOT RUN by this worker**.

## Scope and decisions

- Registered `json`, `openssl`, `base64`, `digest`, `timeout`, `ipaddr`, `securerandom` and `time` alongside the existing `uri` and `net-http` libraries. The checked application directories and `Steep::Diagnostic::Ruby.strict` remain unchanged; unknown constants remain errors.
- Added one flat, bounded `rails_seams.rbs` for the calls actually used by these controllers and services: Rails logging, request bodies/headers/cookies/parameters, controller callbacks/rendering, response cookies, connection pooling, query bindings/results, cache control and transaction ownership.
- `ActiveRecord::Result` is enumerable, has a nullable first row and exposes materialized arrays. Current SQL selects JSON-compatible scalars or formats timestamps in SQL; the row alias documents that scope and preserves the existing domain validators. This is not a general type model for arbitrary ActiveRecord queries.
- `_TenantConnection#disconnect!` is explicit. Both tenancy and session transaction signatures retain the `nil` result from swallowed `ActiveRecord::Rollback`, and model Rails yielding its public transaction object. Root added the post-snapshot String guard before touch in `V1::ReadController`; this worker did not edit that implementation.
- The protected read callback receives the concrete checked-out adapter, which implements the tenancy, session and mailbox/thread reader interfaces. No second connection or transaction is introduced.
- Rack environment extension values are `Object` and must be narrowed at use sites; response headers allow arrays for multiple cookie values. Only the four wire-header names currently used have String-or-nil overloads. Added signatures contain no `untyped`, ignored diagnostics or broad method-missing escape hatch; removed the old `untyped` environment alias from callback redaction.
- Coordinator message `msg_c13cd0c04b39` expanded ownership to the demonstrated production mismatches: URI HTTP/host/port guards in `HealthController` and `AuthClient`, and String narrowing for thread path parameters. Existing Config host policy, domain UUID validation, public error mappings, deadline and auth ownership stay in place.
- Added six regression cases: two in the existing Auth client suite, four in a separate framework boundary suite. They cover valid transport host/port/path and disabled retries, non-HTTP/hostless URI rejection before transport, and both thread actions rejecting nil/array/object/boolean/integer path values as 400 without reader calls. The controller tests isolate parameter narrowing; the root/Auth-owned read-controller suite covers auth, snapshots and touch.

`sessions.rbs`, shared test helpers, migrations, dependencies, frontend, routes, root documentation and Auth session implementation were not edited in this dispatch. No Docker resources, external messages outside Orca, commits, subagents or model calls were created.

## Pinned source basis

Current lockfile versions inspected: Ruby 3.4.11, Rails 8.1.4, Rack 3.2.7, Steep 2.1.0, RBS 4.2.0 and Bundler 2.6.9. The current lockfile SHA256 is `67b2f69a0ed30c1d9926ab2940fe54173991d238192feca38a8f04b97390ea23`; it differs from the older implementation-brief snapshot, which was reported to the coordinator.

Declarations were checked against these pinned primary sources:

- [Rails result enumeration](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/result.rb), [transaction and query APIs](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb), [cache API](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/query_cache.rb), [pool checkout and leased connection](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb).
- [Rails response](https://github.com/rails/rails/blob/v8.1.4/actionpack/lib/action_dispatch/http/response.rb) and [Rack cookie/header behavior](https://github.com/rack/rack/blob/v3.2.7/lib/rack/response.rb).
- [RBS block self-binding syntax](https://github.com/ruby/rbs/blob/v4.2.0/docs/syntax.md), [Enumerable generic parameters](https://github.com/ruby/rbs/blob/v4.2.0/core/enumerable.rbs), [generic URI fields](https://github.com/ruby/rbs/blob/v4.2.0/stdlib/uri/0/generic.rbs) and [HTTP-only request URI](https://github.com/ruby/rbs/blob/v4.2.0/stdlib/uri/0/http.rbs).

## Verification still required

This worker inspected current Ruby call sites, signatures, the lockfile and pinned framework sources. A scoped `git diff --check` returned exit 0 for tracked edited files; all edited AIDEV anchors fit the 120-character limit. These are static text checks, not a parser, typecheck or application-test result.

Run the following **inside the root-owned container**, with the current server tree at its Dockerfile working directory `/app`:

```sh
bundle exec rbs -I sig -r uri -r net-http -r json -r openssl -r base64 -r digest -r timeout -r ipaddr -r securerandom -r time validate
bundle exec steep check
bundle exec ruby -Itest -e 'require_relative "test/be_02/auth_client_test"; require_relative "test/be_02/framework_boundaries_test"'
bundle exec rubocop Steepfile app/controllers/health_controller.rb app/controllers/v1/threads_controller.rb lib/elevateo/auth_client.rb test/be_02/auth_client_test.rb test/be_02/framework_boundaries_test.rb
```

Root must retain the full strict diagnostics and run the existing Auth/session/read-controller/tenancy regression suites with the integrated snapshot. Any remaining domain narrowing or inferred-type errors belong to their implementation owners, rather than a widened framework declaration. No passing RBS/Steep/test/lint result, database behavior, adversarial review, or live Rails request is claimed here. No Docker cleanup was needed because this worker created no Docker resources.

## File inventory and SHA256

Counts are complete current-file lines, not lines added by this dispatch; shared files may include prior authorized work. The twelve implementation/signature/test files total 635 lines. Hashes record the reviewed working-tree bytes before coordinator integration; this report is excluded from its own hash inventory.

| File | Lines | SHA256 |
| --- | ---: | --- |
| `apps/server/Steepfile` | 12 | `224d2fcdd4e39b0974fb47a3a7154588471ea3d85880da5804da342c02dca748` |
| `apps/server/sig/rails_seams.rbs` | 140 | `bc14dd355d387633656eb8c40d7ed6f5edffda063d6f40849c15c525b58b0511` |
| `apps/server/sig/tenancy.rbs` | 38 | `4b29a1e516a984c56ac5c97bef31fd83708a5906dc0e07a92c37da0955009e4b` |
| `apps/server/sig/auth_types.rbs` | 44 | `929fdc62ce1c1985d8823e8af3217fcfed6a75e656819b50c5e535cd5d10b935` |
| `apps/server/sig/read_controller.rbs` | 16 | `5c43d1e9ca2f09967b65fa4ffaa7f4263e97ada1924e9751ff9d3fb112d62e0c` |
| `apps/server/sig/auth_callback_redaction.rbs` | 13 | `c62da8e199422c7559ca7c88bd21f345f9d3433f38609649642201bd5c3f7de7` |
| `apps/server/sig/threads_controller.rbs` | 10 | `dd9643c09a28dfc1cee9f7dc0b90f7e13e33c2eb7ce34bc51f2d9fb5abbdb69b` |
| `apps/server/app/controllers/health_controller.rb` | 41 | `66f196e1341b631296e88791bb86e1407a7c321a008f356be783565cb5ff846e` |
| `apps/server/app/controllers/v1/threads_controller.rb` | 42 | `81d46498e8a72dea4f17b46a2a6af30e12307ecd673b684f8b9bc2dba81ffd83` |
| `apps/server/lib/elevateo/auth_client.rb` | 111 | `3506e173cbc4ae52245766162df54bf39e0dd3140f2236e6b4beb81435daca32` |
| `apps/server/test/be_02/auth_client_test.rb` | 94 | `f0adf47ce618b64d0b0cc59055e57f88e5ee440d2e51139fcb889b80de286a26` |
| `apps/server/test/be_02/framework_boundaries_test.rb` | 74 | `860188f1aea36f6527c725d7aa4616c2ec4ff2787fa6fe8fb83fff4ce9fd7e15` |
