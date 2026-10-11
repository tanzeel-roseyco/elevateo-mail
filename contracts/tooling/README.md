# Canonical client type generation

Inputs: contracts/v1/openapi.json SHA-256 94c5f31bc5d514fed420dcbcee2f6ce49bf4254e325000ea0794fe6a1140e8ca, openapi-typescript 7.13.0 and TypeScript 5.9.3, exact npm lock in this directory.

Run npm ci --ignore-scripts and npm run generate:web inside the pinned Node 24.21.0 Docker image in the FE-01 dispatch. Do not install on the host. Generated output is apps/web/src/data/generated/api.d.ts; runtime validation is separately required.

2026-10-12 evidence: two independent disposable Docker runs (install then npm ci) produced byte-identical output, SHA-256 a72fac903d5bacd8872d5d21501db474ccb40937e79a26213578cdce195ee51d. npm audit reported zero vulnerabilities across 34 packages. This is generator verification, not application testing. Both containers used --rm; the newly pulled Node image was removed afterward. Existing images and volumes were preserved; no host disk compaction or reclaimed-byte claim is made.