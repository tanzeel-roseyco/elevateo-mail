"""Private attachment fixture integration for isolated real-browser acceptance."""
import copy
import json
import stat
from pathlib import Path
import acceptance_cleanup
import acceptance_fixture
import acceptance_runtime
import attachment_runtime
import cleanup
CONTROL = Path(__file__).parent
original_validate = acceptance_cleanup.validate_container
original_private = cleanup.private_files
original_environment = acceptance_runtime.Acceptance.environment

def sidecar(task):
    path = task.acceptance_private / "qa816-attachments.json"
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 4096
            or stat.S_IMODE(info.st_mode) != 0o600
            or (info.st_uid, info.st_gid) != acceptance_cleanup.acceptance_owner(task)):
        raise RuntimeError("attachment receipt ownership invalid")
    return path

def validate(task, item):
    if (getattr(task, "attachment_browser", False)
            and item["Config"]["Labels"].get("com.docker.compose.service") == "acceptance-browser"):
        expected = sidecar(task)
        matches = [mount for mount in item["Mounts"] if mount["Destination"] == "/acceptance/qa816-attachments.json"]
        if len(matches) != 1 or matches[0]["Type"] != "bind" or matches[0]["RW"] or Path(matches[0]["Source"]) != expected:
            raise RuntimeError("attachment receipt mount invalid")
        item = copy.deepcopy(item)
        item["Mounts"] = [mount for mount in item["Mounts"] if mount["Destination"] != "/acceptance/qa816-attachments.json"]
    original_validate(task, item)

def private_files(task, removed):
    if getattr(task, "attachment_browser", False) and (task.acceptance_private / "qa816-attachments.json").exists():
        path = sidecar(task)
        if task.project_containers() or task.docker("attachment-receipt-users", ["container", "ls", "-aq", "--filter", "volume=" + str(path)]).strip():
            raise RuntimeError("attachment receipt still has consumers")
        path.unlink()
        removed.append("private-file:" + str(path))
    original_private(task, removed)

def configure(acceptance):
    task = acceptance.task
    task.attachment_browser = acceptance.case_id != "SCN-QA-830-P"
    # AIDEV-NOTE: Only the privileged fixture sees Storage authority; browser receives the closed receipt.
    mounts = [(task.root / "tests/acceptance", "/workspace/tests/acceptance", False),
              (CONTROL / "acceptance_attachment_producer.rb", "/workspace/attachment-producer.rb", False)]
    for service in ("acceptance-seed", "acceptance-invitation"):
        task.acceptance_mounts[service].update(mounts)
    env = {"BE02_WORKER_DATABASE_URL": "postgres://elevateo_worker:${WORKER_DB_PASSWORD:?}@db:5432/postgres",
           "BE02_STORAGE_SERVICE": "${BE02_STORAGE_SERVICE:?}",
           "QA816_DISPOSABLE_ATTACHMENT_SEED": "true", "QA830_STORAGE_ONLY": str(not task.attachment_browser).lower(), "ELEVATEO_STORAGE_URL": "http://storage:5000",
           "ELEVATEO_ATTACHMENT_BUCKET": "be02-attachments",
           "ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN": "${BE02_STORAGE_SERVICE:?}"}
    bind = lambda source, target, read_only: {"type": "bind", "source": str(source), "target": target, "read_only": read_only}
    overlay = {"services": {service: {"environment": env,
        "volumes": [bind(source, target, True) for source, target, _ in mounts]}
        for service in ("acceptance-seed", "acceptance-invitation")}}
    if task.attachment_browser:
        overlay["services"]["acceptance-browser"] = {"environment": {"QA816_ATTACHMENT_PATH": "/acceptance/qa816-attachments.json"},
        "volumes": [bind(acceptance.private / "qa816-attachments.json", "/acceptance/qa816-attachments.json", True)]}
    path = task.evidence / "attachment-browser-compose.json"
    path.write_text(json.dumps(overlay))
    task.attachment_browser_overlay = path

def produce(acceptance):
    task = acceptance.task
    task.compose("attachment-browser-services", ["up", "-d", "--no-deps", *sorted(attachment_runtime.SERVICES)], 60, quiet=True)
    task.compose("attachment-browser-producer", ["run", "--rm", "--no-deps", "acceptance-seed", "bundle", "exec", "ruby",
        "/workspace/attachment-producer.rb"], 180, quiet=True)
    if task.attachment_browser:
        sidecar(task)

def environment(acceptance, index):
    original_environment(acceptance, index)
    path = getattr(acceptance.task, "attachment_browser_overlay", None)
    if path is not None and path not in acceptance.task.compose_files:
        # AIDEV-NOTE: Partial services extend the registered acceptance compose, never the base stack.
        acceptance.task.compose_files.append(path)

def install():
    acceptance_runtime.Acceptance.environment = environment
    acceptance_cleanup.validate_container = validate
    acceptance_fixture.validate_container = validate
    acceptance_runtime.validate_container = validate
    cleanup.validate_container = validate
    cleanup.private_files = private_files
