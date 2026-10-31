#!/usr/bin/env bash
set -euo pipefail
cd /workspace
dotnet build Elevateo.Windows.sln -c Release --no-restore -m:1
dotnet test Elevateo.Windows.sln -c Release --no-build --no-restore --logger 'trx;LogFileName=windows.trx' --results-directory /evidence/windows-tests
bash tests/installer-regressions.sh
bash build/build-installer.sh
