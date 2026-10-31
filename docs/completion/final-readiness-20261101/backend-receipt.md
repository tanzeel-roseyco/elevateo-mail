# Local backend browser coverage: not run

The production-artifact browser matrix intercepts API requests. It is not local backend integration coverage.

The BE-02 harness requires POSIX paths and ownership, so an owned staging volume and controller were prepared before the disk warning. The subsequent instruction forbids touching volumes. The harness cleanup (`ops/tests/be02/cleanup.py:81-90`) explicitly removes volumes; its unchanged lifecycle is incompatible with that instruction. No backend acceptance command was executed. `backend-gate.sh` records the prepared, unexecuted command, not a passing result.

The two task-owned controllers were stopped and removed without `-v`; the staging volume was preserved. No database, fleet host, live mail or production service was touched. Docker Desktop exposes 3.82 GiB RAM, and the host warning reported 4.7 GB free. Existing base images were available, but new backend/application builds were avoided under the disk constraint.
