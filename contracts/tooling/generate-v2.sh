#!/bin/sh
set -eu
cd "$(dirname "$0")/../../apps/web"
exec npm run generate:api:v2
