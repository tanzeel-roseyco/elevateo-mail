# BE-01-R1 partial ops runtime evidence

Source: `5785eba47f3709debb2815c8d86608f7e62d02f3`. Devin ran Docker tests on 2026-10-11, ending 18:28:45 UTC. All 31 exported source blob hashes matched after replacing an archive export affected by CRLF attributes with raw Git blobs.

| Suite | Exit | Runs | Assertions | Failures/errors | Skips |
| --- | --- | --- | --- | --- | --- |
| secrets | 1 | 0 | 0 | LoadError: base64 missing | 0 |
| heartbeat | 0 | 2 | 14 | 0 | 0 |
| egress | 0 | 9 | 39 | 0 | 1: PowerShell unavailable |

The runner exited zero despite the secrets suite failing. The batch is **not passing**. The isolated four-gem harness omitted base64; the application's existing lockfile contains base64 0.3.0. Use the full locked application bundle for subsequent acceptance; no dependency repair is implied by this setup failure.

Raw attachment SHA256: `494a2c533111cbd8045a64f1b4c15de184fadda82078791de0a75de5ec515b9f`; 34,261 bytes. Source: https://app.devin.ai/attachments/0d473c9b-7d22-4562-9b21-2b2bcb9364ab/run.log

The log records task containers, dependency volume and newly pulled image removed. Zero containers/images remained; three persistent volumes (43.8 MB) and six preexisting cache records (118.5 MB) were preserved. Final logged host free space: 120,900,747,264 bytes. No build cache was created. This is Linux remote Docker evidence, not Windows host compaction.

Refreshed Devin Usage UI at approximately 18:34 UTC: $4.20 remaining, $0.00 on-demand. Sleep requested after cleanup. No Rails/PostgreSQL repair acceptance or PowerShell acceptance is claimed.
