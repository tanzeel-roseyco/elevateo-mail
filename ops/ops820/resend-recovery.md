# Populated launch recovery drill

Set `OPS1040_RECOVERY_FIXTURE=1` for both existing `source-snapshot.sh SNAPSHOT` and `restore-rehearsal.sh SNAPSHOT full` invocations. Retain the existing pinned images, task-owned environment, full/source runners, lock and cleanup requirements. This opt-in must be used on both phases; older snapshots remain compatible without it.

The paired snapshot contains an unprocessed Resend event with two attempts, an inactive mailbox route, a pending draft attachment and committed staging metadata, and its private object bytes. Restore verifies queue/route fields, tenant/draft association, scan state, object key, byte size and SHA-256, plus the bucket privacy and exact retrieved bytes. Failures stop before schema reversal. After success, only these exact synthetic SQL records are removed from the disposable restored database so the unchanged empty-schema down/up proof can proceed. Private object bytes remain until task-owned volume cleanup. This does not assert that migrations can roll back populated live attachment data.

Inside the existing admitted Python Docker image, run `python3 -m unittest discover -s ops/ops820 -p test_resend_recovery.py` for verifier regressions. The full paired drill remains required to establish actual PostgreSQL/Storage recovery. No production backup or live provider event is used.
