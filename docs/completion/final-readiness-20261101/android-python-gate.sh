#!/bin/bash
set -euo pipefail
cd /src/apps/android
python3 -m unittest discover -s . -p 'test_*.py'
cd build
python3 -m unittest discover -s . -p 'test_*.py'
