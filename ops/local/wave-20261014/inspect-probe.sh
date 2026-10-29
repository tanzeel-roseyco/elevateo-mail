#!/usr/bin/env bash
set -euo pipefail
ps -eo pid,ppid,etime,rss,args | grep -E 'codex exec|probe-remote-model' | grep -v grep || true
tail -n 20 /home/tanzeel/elevateo-mail-wave-20261014/reports/model-probe-0160.jsonl
