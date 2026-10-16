"""Short-lived HTTPS app fixture for an explicitly attached Android QA emulator."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import re
import secrets
import stat
import time
from acceptance_cleanup import acceptance_owner, validate_container
from acceptance_fixture import seed_application, start_service
from android_certificates import NAMES, copy_certificates

PROBE_IMAGE = "python@sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44"
from docker_task import Task


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--android-fixture", action="store_true")
    parser.add_argument("--android-certs", type=Path)
    parser.add_argument("--android-socket-dir", type=Path)
    parser.add_argument("--android-ca-sha256")
    parser.add_argument("--android-ttl", type=int, default=600)


def validate_arguments(args: argparse.Namespace) -> None:
    if not args.android_fixture:
        if args.android_certs or args.android_ca_sha256 or args.android_socket_dir or args.android_ttl != 600:
            raise RuntimeError("Android settings require Android fixture mode")
        return
    if any((args.acceptance, args.acceptance_diagnostic, args.acceptance_case, args.acceptance_observer,
            args.mox, args.attachments, args.adv808_auth_policy, args.adv815_expiry)):
        raise RuntimeError("Android fixture requires its own disposable job")
    if (args.android_certs is None or not args.android_certs.is_absolute()
            or args.android_socket_dir is None or not args.android_socket_dir.is_absolute()
            or not re.fullmatch(r"[a-f0-9]{64}", args.android_ca_sha256 or "")
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", args.acceptance_dispatch_id or "")
            or not 30 <= args.android_ttl <= 900):
        raise RuntimeError("Android fixture requires approved CA material, dispatch identity and TTL30..900")


def validate_socket_directory(path: Path, uid: int, gid: int) -> None:
    # AIDEV-NOTE: The outer gate owns this empty directory and removes it only after its emulator has stopped.
    info = path.lstat()
    if (path.resolve() != path or not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_gid != gid
            or stat.S_IMODE(info.st_mode) != 0o700 or any(path.iterdir())):
        raise RuntimeError("Android socket directory must be empty, owned and mode0700")


class AndroidFixture:
    def __init__(self, task: Task, args: argparse.Namespace) -> None:
        self.task, self.args = task, args
        setattr(task, "acceptance_uid", os.geteuid())
        setattr(task, "acceptance_gid", os.getegid())
        uid, gid = acceptance_owner(task)
        if task.root.resolve() != task.root or task.root.stat().st_uid != uid:
            raise RuntimeError("Android fixture source ownership invalid")
        exclusions = {line.strip().rstrip("/") for line in (task.root / ".dockerignore").read_text().splitlines()
                      if line.strip() and not line.lstrip().startswith("#")}
        if (not {"ops/local", "**/node_modules", "**/dist", "**/.env*"} <= exclusions
                or any(line.startswith("!") for line in exclusions)
                or (task.root / "ops/acceptance/web.Dockerfile.dockerignore").exists()):
            raise RuntimeError("Android build context must exclude private/generated paths")
        validate_socket_directory(args.android_socket_dir, uid, gid)
        self.private = task.evidence / "acceptance-private"
        task.acceptance_private = self.private
        task.android_tls = task.evidence / "android-tls"
        self.web = task.project + ":android-web"
        # AIDEV-NOTE: Register images, directories and exact mounts before any build, copy or container creation.
        task.owned_image_tags.add(self.web)
        task.acceptance_mounts = {
            "android-web": {(task.android_tls / name, "/run/android-tls/" + name, False) for name in NAMES},
            "android-connect": {(args.android_socket_dir, "/relay", True)},
            "android-probe": {(args.android_socket_dir, "/relay", False),
                              (task.android_tls / "ca.pem", "/run/android-tls/ca.pem", False),
                              (task.root / "ops/tests/be02/android_connect_probe.py", "/probe.py", False)},
            "acceptance-seed": {(task.root / path, destination, False) for path, destination in (
                ("apps/server", "/workspace/apps/server"), ("contracts", "/workspace/contracts"),
                ("ops/tests/be02", "/workspace/ops/tests/be02"),
                ("tests/acceptance/shared/seed-contract.json", "/acceptance-contract/seed-contract.json"))}}
        task.acceptance_mounts["acceptance-seed"].add((self.private, "/acceptance", True))
        self.env = {"BE02_ANDROID_SOCKET_DIR": str(args.android_socket_dir),
            "BE02_ACCEPTANCE_PRIVATE": str(self.private), "BE02_ANDROID_TLS": str(task.android_tls),
            "BE02_ACCEPTANCE_WEB_IMAGE": self.web, "BE02_ACCEPTANCE_UID": str(uid), "BE02_ACCEPTANCE_GID": str(gid),
            "BE02_ACCEPTANCE_DISPATCH_ID": args.acceptance_dispatch_id,
            "BE02_ACCEPTANCE_RUN_ID": task.project + "-android", "BE02_ACCEPTANCE_NONCE": secrets.token_hex(32)}
        task.deadline = time.monotonic() + 3600

    def run(self) -> None:
        task = self.task
        self.private.mkdir(mode=0o700)
        copy_certificates(task, self.args.android_certs, self.args.android_ca_sha256)
        task.ensure_builder()
        task.docker("android-web-build", ["buildx", "build", "--builder", task.builder, "--load",
                    "--platform", "linux/amd64", "--label", "elevateo.be02.project=" + task.project,
                    "--tag", self.web, "-f", str(task.root / "ops/acceptance/web.Dockerfile"), str(task.root)], 900)
        # AIDEV-NOTE: Validate the actual runtime images; BuildKit need not load the pinned Node base separately.
        for service, pin in {"acceptance-seed": task.image, "android-web": self.web,
                             "android-connect": self.web, "android-probe": PROBE_IMAGE}.items():
            metadata = task.inspect("image", [pin])[0]
            if metadata["Os"] != "linux" or metadata["Architecture"] != "amd64" or metadata["Config"].get("Volumes"):
                raise RuntimeError("Android service requires Linux amd64 without anonymous volumes")
            task.acceptance_images[service] = metadata["Id"]
        task.write("android-images.json", {"services": task.acceptance_images})
        task.compose_files.append(task.root / "ops/compose.android-test.yaml")
        with task.env_file.open("a") as stream:
            stream.write("".join(f"{key}={value}\n" for key, value in self.env.items()))
        task.compose("android-config", ["config", "--quiet"], quiet=True)
        seed_application(task, self.private)
        task.compose("android-consumers-start", ["up", "-d", "--no-deps", "--force-recreate", "api", "worker"], 45, quiet=True)
        task.runtime_credentials()
        web = start_service(task, "android-web")
        connector = start_service(task, "android-connect")
        task.docker("android-readiness", ["exec", "-e", "NODE_EXTRA_CA_CERTS=/run/android-tls/ca.pem",
                                         web, "node", "/srv/proxy/android-readiness.js"], 70, quiet=True, diagnostic_stderr=True)
        probe_connection(task, connector)
        hold_fixture(task, self.args.android_ttl)



def probe_connection(task: Task, connector: str) -> None:
    # AIDEV-NOTE: Only a successful offline probe through the shared socket can authorize READY.
    for after_probe in (False, True):
        item = task.inspect("container", [connector])[0]
        validate_container(task, item)
        if not item["State"]["Running"]:
            raise RuntimeError("Android CONNECT service is not running")
        if not after_probe:
            identity = start_service(task, "android-probe")
            if task.docker("android-probe-wait", ["container", "wait", identity], 70).strip() != "0":
                raise RuntimeError("Android UNIX CONNECT path is unavailable")
            validate_container(task, task.inspect("container", [identity])[0])
            task.docker("android-probe-remove", ["container", "rm", identity], quiet=True)


def hold_fixture(task: Task, ttl: int) -> None:
    # AIDEV-NOTE: A detached fleet launcher survives SSH loss; TTL closure is not app acceptance PASS.
    if task.deadline - time.monotonic() < ttl + 30:
        raise RuntimeError("insufficient Android fixture hold budget")
    end = time.monotonic() + ttl
    task.write("android-ready.json", {"status": "READY", "project": task.project,
        "origin": "https://elevateo.qa.internal", "connect": "unix:/relay/edge.sock", "expires_at": time.time() + ttl,
        "external_mail": False, "app_acceptance": "NOT_RUN"})
    print(f"ANDROID READY project={task.project} ttl={ttl}", flush=True)
    reason = "ttl_expired"
    while time.monotonic() < end:
        if (task.evidence / "android-stop").exists():
            reason = "requested_stop"
            break
        time.sleep(min(1, max(0, end - time.monotonic())))
    task.write("android-closed.json", {"reason": reason, "app_acceptance": "NOT_RUN"})
