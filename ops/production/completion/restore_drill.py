"""Execute only inside the final Docker gate against disposable, migrated fixture projects."""
from __future__ import annotations

import os
import base64
from pathlib import Path
import tempfile

from common import compose, required, run, sql
from recovery import exclusive, restore
from volume_backup import VOLUMES, snapshot
import tarfile


def snapshot_ready(destination: Path) -> None:
    snapshot(destination)
    # AIDEV-NOTE: Cold snapshot restarts services asynchronously; source mutation must wait for database health.
    run(compose() + ["up", "-d", "--no-deps", "--wait", "--wait-timeout", "120", "db"], timeout=150)


def drill() -> None:
    # AIDEV-NOTE: This mutates fixture state after backup to prove time rollback cannot revive sessions or send work.
    if not compose()[3].startswith("elevateo-drill-"):
        raise ValueError("disposable source fixture project required")
    target_file = Path(required("ELEVATEO_DRILL_RESTORE_COMPOSE_FILE"))
    target_project = required("ELEVATEO_DRILL_RESTORE_PROJECT")
    if not target_file.is_absolute() or not target_project.startswith("elevateo-restore-"):
        raise ValueError("isolated restore target required")
    sql("""DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM app_auth.sessions WHERE state='active')
      OR NOT EXISTS(SELECT 1 FROM app_connector_private.grants WHERE NOT revoked)
      OR NOT EXISTS(SELECT 1 FROM app_send_private.jobs WHERE state IN ('queued','dispatching','unknown'))
      THEN RAISE EXCEPTION 'active authority and pending send fixtures required'; END IF;
    END $$;""")
    with exclusive(), tempfile.TemporaryDirectory(prefix="elevateo-drill-") as temporary:
        root = Path(temporary)
        saved = root / "snapshot"
        saved.mkdir(mode=0o700)
        snapshot_ready(saved)
        # No provider request: acceptance is a deterministic DB fixture after the captured boundary.
        sql("""BEGIN;
          UPDATE app_auth.sessions SET state='revoked',revoked_at=clock_timestamp();
          UPDATE app_connector_private.grants SET revoked=true;
          UPDATE app_send_private.jobs SET state='accepted',next_action='none',next_check_at=NULL,
            accepted_at=clock_timestamp(),accepted_receipt_ref='restore-drill-fixture',
            lease_id=NULL,lease_expires_at=NULL WHERE state IN ('queued','dispatching','unknown');
        COMMIT;""")
        bundle = root / "snapshot.tar"
        with tarfile.open(bundle, "w") as archive:
            for name in ["manifest.json", *(f"{key}.tar" for key in sorted(VOLUMES))]:
                archive.add(saved / name, arcname=name, recursive=False)
        identity = root / "identity"
        run(["age-keygen", "-o", str(identity)])
        recipient = run(["age-keygen", "-y", str(identity)]).decode().strip()
        encrypted = root / "snapshot.age"
        run(["age", "-r", recipient, "-o", str(encrypted), str(bundle)])
        os.environ["COMPOSE_FILE"] = str(target_file)
        os.environ["COMPOSE_PROJECT_NAME"] = target_project
        os.environ["ELEVATEO_BACKUP_AGE_IDENTITY_BASE64"] = base64.b64encode(identity.read_bytes()).decode()
        restore(encrypted, root / "restored")
        try:
            run(compose() + ["up", "-d", "--no-deps", "--wait", "db"])
            sql("""DO $$ BEGIN
              IF EXISTS(SELECT 1 FROM app_auth.sessions WHERE state<>'revoked')
              OR EXISTS(SELECT 1 FROM app_connector_private.grants WHERE NOT revoked)
              OR NOT EXISTS(SELECT 1 FROM app_send_private.jobs
                WHERE state='needs_review' AND next_action='none' AND hold_reason='restore_unreconciled')
              THEN RAISE EXCEPTION 'restored temporal safety assertion failed'; END IF;
            END $$;""")
        finally:
            run(compose() + ["stop", "--timeout", "60", "db"])
    print("restore drill passed: six-volume readback, revoked authority, no automatic send replay")


if __name__ == "__main__":
    try:
        drill()
    except (ValueError, RuntimeError, OSError):
        raise SystemExit("restore drill failed; private details withheld") from None
