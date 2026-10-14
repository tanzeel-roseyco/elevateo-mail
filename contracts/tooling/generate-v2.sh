#!/bin/sh
set -eu
cd "$(dirname "$0")"
./node_modules/.bin/openapi-typescript ../v2/openapi.json --output ../../apps/web/src/data/generated/api-v2.d.ts
