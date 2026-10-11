# Frontend runtime and dependency follow-up

Research checked 2026-10-12. This supplements the immutable source-reuse packet; it does not modify that packet or its historical lock selections. No install, image pull, build, application test or new dependency resolution ran.

<!-- AIDEV-NOTE: Registry checks cover named versions only; audit the new resolved lock before implementation acceptance. -->

## Runtime selection

Use `node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20` for frontend build/test tooling. Parent verified this multi-platform index by `docker buildx imagetools inspect`; its Linux amd64 manifest is `sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd`, image source revision `93a7bafc324a85ac1ee461604cff87cffacb6d7a`. Those digest observations are parent-provided evidence, not a pull or executed runtime verification by this researcher.

The official [distribution index](https://nodejs.org/dist/index.json) and [release page](https://nodejs.org/en/about/previous-releases) confirm v24.21.0, released 2026-09-07, Krypton LTS with npm 11.19.0. The [release schedule](https://github.com/nodejs/Release/blob/main/schedule.json) gives Active LTS until 2026-10-20, then maintenance until 2028-04-30. Node 20 meeting Vite's minimum is insufficient maintenance justification: Node 20 is already EOL. Node is MIT with bundled third-party notices; retain the actual distribution's [license inventory](https://github.com/nodejs/node/blob/v24.21.0/LICENSE). Debian and npm/bundled software require their own notices in the eventual image inventory.

## Selected versions and compatibility evidence

Version-specific official npm registry metadata was fetched for every linked row. License values below are package metadata declarations, not a full tarball/transitive license inventory. These pins retain inspected first-party choices except the explicitly justified Vitest change.

| Dependency and exact candidate | License | Purpose / metadata compatibility |
|---|---|---|
| [react 19.3.0](https://registry.npmjs.org/react/19.3.0), [react-dom 19.3.0](https://registry.npmjs.org/react-dom/19.3.0) | MIT | UI renderer; react-dom peer requires React ^19.3.0. Keep versions paired. |
| [react-router 7.18.4](https://registry.npmjs.org/react-router/7.18.4) | MIT | URL navigation; Node >=20, React/DOM >=18. |
| [vite 7.3.6](https://registry.npmjs.org/vite/7.3.6) | MIT | Build/dev tooling; Node ^20.19.0 or >=22.12.0, satisfied by selected 24.21.0. |
| [vitest 4.1.11](https://registry.npmjs.org/vitest/4.1.11) | MIT | Replace source's 3.2.7 for security/maintenance reason below; Node ^20 or ^22 or >=24 and Vite ^6/^7/^8. |
| [@vitest/coverage-v8 4.1.11](https://registry.npmjs.org/@vitest%2fcoverage-v8/4.1.11) | MIT | Coverage paired exactly with Vitest 4.1.11. |
| [zod 4.6.5](https://registry.npmjs.org/zod/4.6.5) | MIT | Boundary schemas; no Node engine declared in package metadata. |
| [typescript 5.9.3](https://registry.npmjs.org/typescript/5.9.3) | Apache-2.0 | Strict static checking; Node >=14.17. |
| [@radix-ui/react-dialog 1.1.23](https://registry.npmjs.org/@radix-ui%2freact-dialog/1.1.23), [@radix-ui/react-alert-dialog 1.1.23](https://registry.npmjs.org/@radix-ui%2freact-alert-dialog/1.1.23) | MIT | Existing accessible dialogs/confirmation; React/DOM peers explicitly include ^19.0. Retain alert-dialog only if confirmation primitive is selected. |
| [@playwright/test 1.56.1](https://registry.npmjs.org/@playwright%2ftest/1.56.1) | Apache-2.0 | Historical source browser-test pin; Node >=18. Browser runtime matching remains mandatory. |

This is the requested minimal framework/test selection, not a complete runnable manifest: the implementation still needs exact supporting UI/build/lint/test packages selected by its actual imports and configuration. Avoid importing Zustand/mock state or Tauri tooling merely because they existed in the old source. Engine and peer compatibility is metadata evidence, not proof of runtime interoperability.

## Advisory result and concrete change

Queried the official npm `POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk` with exact versions: React/DOM 19.3.0, router 7.18.4, Vite 7.3.6, Vitest 3.2.7, Zod 4.6.5, TypeScript 5.9.3, both Radix packages 1.1.23, @playwright/test/playwright/playwright-core 1.56.1. Only Vitest returned an advisory in that specific response.

[GHSA-82fw-gwwq-j7x9](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9), published 2026-08-18, flags Vitest/@vitest/mocker >=2.1.0 below 4.1.11: moderate arbitrary file read through redirect mocks. Its unauthenticated path requires an accessible development WebSocket using public mocker/interceptor plugins; Vitest browser mode uses token-authenticated RPC. This is not evidence of production application compromise. Upstream explicitly says older 3.x is unmaintained and will not receive the fix. For a new foundation, choose fixed 4.1.11 instead of accepting this historical dependency.

A second exact bulk query for Vitest, @vitest/coverage-v8 and @vitest/mocker 4.1.11 returned `{}`. Registry confirms compatible engines/peers. Consult the [Vitest migration guide](https://vitest.dev/guide/migration/) and review changed mocks, configuration and coverage behavior when writing/adapting tests; no migration compatibility has been executed here. Exact registry integrity evidence:

- Vitest 4.1.11: `sha512-fhACrNXUidIbGSBr5FlbuBkO7VWC1ZyLl0DO4CU2DrQoAPxX84Ysxs+HeGQpii5lZWV1Q4gBZTTu49mF+A6Edw==`.
- @vitest/coverage-v8 4.1.11: `sha512-8MVGEFnJIcdGjcbfKmeq8z0pZHH0JlVtoVZH9Q/qwUp6wyFnEJUBMrw9DCaj+ra3vShGmhavjalMIhPNxZAUcw==`.

The historical Playwright pin is available and engine-compatible; this establishes neither current browser security nor maintained-browser coverage. [Official Docker documentation](https://playwright.dev/docs/docker) currently shows 1.64.0 and requires project/image browser versions to match. Before browser-test acceptance, select a current matched package/browser image or document a bounded historical-baseline need; inspect and pin its digest separately. The selected Node slim image does not already contain Playwright browsers/system libraries. Use only the task's local application, not arbitrary external pages, in test containers.

## Remaining acceptance work

Resolve and freeze the new exact lock, query all resolved production and development versions, inspect licenses/notices including transitive packages and browser/image components, verify container image vulnerabilities, and execute containerized type/lint/unit/integration/browser checks. No whole-tree audit, clean image claim, supported-old-browser claim or completed runtime verification follows from the limited registry checks above. The actionable blocker to carrying over the old test dependency is Vitest 3.2.7; the runtime and other checked peer/engine constraints show no incompatibility with Node 24.21.0.

## D-07 canonical OpenAPI type generation

Select dev dependency **openapi-typescript 7.13.0**. [Publisher documentation](https://openapi-ts.dev/introduction) supports OpenAPI 3.0/3.1 and emits runtime-free TypeScript types; Node 20+ is recommended. [Exact registry metadata](https://registry.npmjs.org/openapi-typescript/7.13.0) declares MIT and TypeScript peer `^5.x`, compatible by metadata with TypeScript 5.9.3 and Node 24.21.0. No top-level `engines` field is declared; a resolved transitive engine check remains necessary.

Registry integrity: `sha512-EFP392gcqXS7ntPvbhBzbF8TyBA+baIYEm791Hy5YkjDYKTnk/Tn5OQeKm5BIZvJihpp8Zzr4hzx0Irde1LNGQ==`. Publisher dependencies are `parse-json ^8.3.0`, `ansi-colors ^4.1.3`, `change-case ^5.4.4`, `yargs-parser ^21.1.1`, `supports-color ^10.2.2`, and `@redocly/openapi-core ^1.34.6`. These ranges are evidence of the generator manifest, not resolved transitive pins. Freeze actual resolved versions in the new lock.

The [documented CLI](https://openapi-ts.dev/cli) accepts a local JSON/YAML entrypoint and supports `--check`. After the pinned dependency is installed in the authorized Docker build, an npm script can invoke the local binary as follows (adjust only the actual canonical entrypoint and frontend output path):

```text
openapi-typescript contracts/v1/openapi.yaml --output frontend/src/data/generated/api.d.ts
openapi-typescript contracts/v1/openapi.yaml --output frontend/src/data/generated/api.d.ts --check
```

Run from the repository root through the installed local binary or its npm script, with no on-demand package download. Keep `$ref` inputs local and version-controlled. Regeneration and `--check` must operate on the same file/options. Generated types describe all four GET endpoints without duplicating DTO interfaces; use their `paths`/`components` exports in gateway signatures and fixture typechecks. This package generates types, not runtime validators or executable fetch methods: retain the bounded transport and boundary validation, and do not describe it as a generated executable SDK. If D-07 requires an executable generated client beyond its accepted types option, select that separately rather than claim this generator fulfills it.

An exact official npm bulk advisory query for `openapi-typescript 7.13.0` returned no entry on 2026-10-12. This excludes neither transitive advisories nor schema-generation bugs. No generated output or runtime compatibility test was produced in this research step.

## Matched current Playwright selection

For the new test foundation select **@playwright/test 1.64.0**, superseding the historical source pin discussed above. [Exact registry metadata](https://registry.npmjs.org/@playwright%2ftest/1.64.0) declares Apache-2.0, Node >=20, and exact dependency `playwright 1.64.0`. Package integrity: `sha512-oTN9FNYuN6bqQMwiho6jJKLCG2/QOYCixGXuCjRmzOq23eODeukuY2XiAVoVpAECbuezMt1MHQjAiQxK8F+Y+g==`.

Use official browser image `mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f`. Direct remote `docker buildx imagetools inspect` verified:

- Linux amd64 manifest: `sha256:bc72a8df40831ded821e3cbc79c318c21b44d6e51dff9fd89ace7a8249c5b462`.
- Linux arm64 manifest: `sha256:4109b399f6d3de22a133ab935df0d7614ed0de9195d529f0ebc6255655cdb495`.

The [official Docker guide](https://playwright.dev/docs/docker) confirms the image contains browsers and OS dependencies but not the project Playwright npm package. Keep project package/image versions matched. The image's own Node version was not executed/verified; do not claim it is the separately selected Node 24 build image. Exact npm bulk advisory query for `@playwright/test`, `playwright` and `playwright-core`, all 1.64.0, returned no entries. Browser/OS vulnerability review is separate. No image was pulled, and no container or browser ran for this verification.
