#!/usr/bin/env python3
"""AIDEV-NOTE: Exact old-pin replacement under an exclusive filesystem lease; stop and retain partial writes."""
import hashlib
import os
from pathlib import Path
import stat
import subprocess
import sys
import tarfile

SOURCE = Path("/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012")
ARCHIVE_SHA = "b4664cb774fa24b338d7dd2463aeb2cd5371ee381a6cb562e82278ba252056f5"
PINS = {'ops/tools/be01-services/profile.jq': ['803dd61d285ffcc14702002355366a18b5b93e58ee88ec2051ca94b5b838da9d', 'd7e8a7d982b4e9bac6bbca3daf8f13494a8181a40d4d704dcd7a28fc93b9b633'], 'ops/tools/be01-services/profile-regression.sh': ['5008cc993b651374e6eb1e5ad2912263a909991f9dd7125bb7311a2068d08a13', 'a80ebee722656cdf1311a28ce4d6621c5332358bd336b63c2668caab8ba93889'], 'ops/tools/be01-services-volume-check/checks.sh': ['3e4b75f5c010ca86a32434e359d3161dc4f7631ee173225d1c6143b8f8f703b4', 'd51f8fbe765c077f804dfe1334d33df3316571d14ab1d098325719707d72f050'], 'ops/tools/be01-services/package.sha256': ['b20a69471069c9e8c24d241c327fb1457c55982d175756b3623bd15036e7cbc3', 'ad4773807748c99d23c763f2a6203a4cde276c68cca09ea6f9f030380252235d'], 'ops/tools/be01-services-app/dispatch.sh': ['3b452c1e20d750487f0c464007739448075acb31d581bf9893c75f3247d63e92', '5d159340df518eaf4dcaf7c67d76728befb18b6e34f5761dee1bc124f777541c'], 'ops/tools/be01-services-app/regression.sh': ['90a7d57d5c53e146155ff31f5437200ebee580e459c4313c52414582b8d308e8', 'bdab4ccb62c24b4433d4d05c2f1b901155f4e8f4c6dcd47d88d6b42aca55518f'], 'ops/tools/be01-services-app/package.sha256': ['2da812bb3a95fabdad927a7ed9d5c7fb1e03d4fac0601ca66100c80938f48466', 'e00f1937002e6efef78b3a7dd1e733f351955377e95fe43fdbddc1036c3245ef'], 'ops/tools/be01-services-volume-check/package.sha256': ['5c40fbe1efe92b65b2f99a0120497027d7971127bae4eb689b7ad718d3fc88e7', 'af243965b395e7defd021b9f249958ab77b01e881bc2bae30811b63928ca99ad']}
MANIFESTS = ["ops/tools/be01-services-volume-check/package.sha256", "ops/tools/be01-services/package.sha256",
             "ops/tools/be01-services/dependencies.sha256", "ops/tests/be01-services/package.sha256",
             "ops/tests/fleet02-egress-source.sha256", "ops/tools/be01-services-app/package.sha256",
             "ops/tools/lane-c-app/app.sha256"]

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def regular(path: Path) -> bytes:
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError("not a regular file")
    return path.read_bytes()

def ancestors(path: Path) -> None:
    for parent in (path, *path.parents):
        if not stat.S_ISDIR(parent.lstat().st_mode):
            raise ValueError("unsafe directory boundary")

def authenticate() -> None:
    for manifest in MANIFESTS:
        subprocess.run(["sha256sum", "-c", "--quiet", manifest], cwd=SOURCE, check=True, timeout=60)


def main() -> None:
    if len(sys.argv) != 3:
        raise ValueError("archive and fresh evidence directory required")
    archive, evidence = map(Path, sys.argv[1:])
    ancestors(archive.parent)
    ancestors(evidence.parent)
    payload = regular(archive)
    if digest(payload) != ARCHIVE_SHA:
        raise ValueError("archive authentication failed")
    import io
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as handle:
        members = handle.getmembers()
        if len(members) != 8 or {m.name for m in members} != set(PINS) or not all(m.isfile() for m in members):
            raise ValueError("archive members rejected")
        files = {}
        for member in members:
            stream = handle.extractfile(member)
            if stream is None:
                raise ValueError("missing regular payload")
            data = stream.read()
            if digest(data) != PINS[member.name][1]:
                raise ValueError("member authentication failed")
            files[member.name] = data
    for name, (old, _) in PINS.items():
        ancestors((SOURCE / name).parent)
        if digest(regular(SOURCE / name)) != old:
            raise ValueError("old pin mismatch")
    authenticate()
    # No existing evidence directory is reused, including a dangling link.
    evidence.mkdir(mode=0o700)
    for name, (old, _) in PINS.items():
        data = regular(SOURCE / name)
        if digest(data) != old:
            raise ValueError("old pin changed before backup")
        with (evidence / name.replace("/", "__")).open("xb") as backup:
            backup.write(data)
    # Manifests are installed last; partial failure is preserved, never retried or rolled back blindly.
    for name in sorted(PINS, key=lambda item: item.endswith(".sha256")):
        target = SOURCE / name
        ancestors(target.parent)
        if digest(regular(target)) != PINS[name][0]:
            raise ValueError("old pin changed before replacement")
        with target.open("wb") as output:
            output.write(files[name])
        target.chmod(0o644)
        if digest(regular(target)) != PINS[name][1] or stat.S_IMODE(target.stat().st_mode) != 0o644:
            raise ValueError("installed bytes or mode mismatch")
    authenticate()
    print("STAGING_EXIT=0 SOURCE_EXIT=0 EIGHT_HASH_MODE_EXIT=0")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("STAGING_EXIT=1 SOURCE_EXIT=unproven RETAIN_PARTIAL_STATE", file=sys.stderr)
        raise
