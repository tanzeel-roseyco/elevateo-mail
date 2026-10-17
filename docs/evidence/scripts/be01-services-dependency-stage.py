#!/usr/bin/env python3
"""Authenticate frozen dependencies before exclusive additive two-directory staging."""
import hashlib
import io
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile

ARCHIVE = "f9455d2fb3e66412fc6ac7c171027d9745c1163cf6a8e883d493d5c3dccc826a"
ALLOWLIST = "0297f2c03e3049b1746829907e589fbda5847357c47af6bcd079d48f1a0a27c2"
ADAPTER = "ops/tools/be01-services"
FIXTURES = "ops/tests/be01-services"
PACKAGES = {ADAPTER: "3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787",
            FIXTURES: "028c90c20b356ffaa8c4ba285524d4835dd8513685c096aa41acaa12b22a476d"}
SOURCE = "ops/tests/fleet02-egress-source.sha256"
SOURCE_SHA = "03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b"


def authenticate(data: bytes, expected: str) -> None:
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError("hash mismatch")


def entries(data: bytes) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in data.decode("ascii").splitlines():
        digest, name = line.split("  ", 1)
        path = PurePosixPath(name)
        if (name in result or path.is_absolute() or str(path) != name or ".." in path.parts
                or "\\" in name or not path.parts or len(digest) != 64
                or any(c not in "0123456789abcdef" for c in digest)):
            raise ValueError("invalid manifest entry")
        result[name] = digest
    return result


def safe_directory(path: Path, root: Path) -> None:
    if path != root and root not in path.parents:
        raise ValueError("directory outside bind root")
    for parent in reversed((path, *path.parents)):
        mode = parent.lstat().st_mode
        # AIDEV-NOTE: Daemon resolves host ancestors; UID10001 traverses only the bind root and descendants.
        visible = parent == root or root in parent.parents
        if not stat.S_ISDIR(mode) or (visible and not mode & stat.S_IXOTH):
            raise ValueError("unsafe or nontraversable ancestor: " + str(parent))


def read_source(root: Path, name: str) -> bytes:
    path = root / name
    safe_directory(path.parent, root)
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError("nonregular source: " + name)
    return path.read_bytes()


def payloads(archive: Path, allowlist: Path) -> dict[str, bytes]:
    data, manifest = archive.read_bytes(), allowlist.read_bytes()
    authenticate(data, ARCHIVE)
    authenticate(manifest, ALLOWLIST)
    expected = entries(manifest)
    if len(expected) != 24 or any(str(PurePosixPath(p).parent) not in PACKAGES for p in expected):
        raise ValueError("unexpected dependency scope")
    blobs: dict[str, bytes] = {}
    # AIDEV-NOTE: Parse authenticated bytes in memory; never extract archive paths or inherit archive permissions.
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive_file:
        members = archive_file.getmembers()
        if len(members) != 24 or {m.name for m in members} != set(expected):
            raise ValueError("archive allowlist mismatch")
        for member in members:
            if not member.isreg() or member.linkname or member.size > 100_000:
                raise ValueError("unsafe archive entry")
            stream = archive_file.extractfile(member)
            if stream is None:
                raise ValueError("missing archive payload")
            blobs[member.name] = stream.read()
            authenticate(blobs[member.name], expected[member.name])
    for prefix, pin in PACKAGES.items():
        package = prefix + "/package.sha256"
        authenticate(blobs[package], pin)
        listed = entries(blobs[package])
        if set(listed) | {package} != {p for p in blobs if p.startswith(prefix + "/")}:
            raise ValueError("package file set mismatch")
        for name, digest in listed.items():
            authenticate(blobs[name], digest)
    return blobs


def verify_dependencies(root: Path, blobs: dict[str, bytes]) -> None:
    source_manifest = read_source(root, SOURCE)
    authenticate(source_manifest, SOURCE_SHA)
    canonical = entries(source_manifest)
    if len(canonical) != 52 or set(canonical) & set(blobs):
        raise ValueError("canonical source scope mismatch")
    for name, digest in canonical.items():
        authenticate(read_source(root, name), digest)
    dependencies = entries(blobs[ADAPTER + "/dependencies.sha256"])
    for name, digest in dependencies.items():
        authenticate(blobs[name] if name in blobs else read_source(root, name), digest)


def stage(archive: Path, allowlist: Path, root: Path) -> None:
    if not root.is_absolute() or root.resolve() != root:
        raise ValueError("canonical source must be absolute and resolved")
    blobs = payloads(archive, allowlist)
    safe_directory(root / "ops/tools", root)
    safe_directory(root / "ops/tests", root)
    # AIDEV-NOTE: Check BOTH targets before creation; lexists semantics also refuse dangling symlinks.
    for prefix in PACKAGES:
        target = root / prefix
        if target.exists() or target.is_symlink():
            raise FileExistsError(str(target))
    verify_dependencies(root, blobs)
    # AIDEV-NOTE: No rollback/retry: an I/O failure retains exact partial directories for coordinator reconciliation.
    for prefix in PACKAGES:
        target = root / prefix
        target.mkdir(mode=0o755, exist_ok=False)
        target.chmod(0o755)
        for name in sorted(p for p in blobs if p.startswith(prefix + "/")):
            destination = root / name
            with destination.open("xb") as output:
                output.write(blobs[name])
            destination.chmod(0o644)
    for prefix in PACKAGES:
        target = root / prefix
        expected = {p for p in blobs if p.startswith(prefix + "/")}
        if {p.relative_to(root).as_posix() for p in target.iterdir()} != expected:
            raise ValueError("post-stage file set mismatch")
        if stat.S_IMODE(target.stat().st_mode) != 0o755:
            raise ValueError("post-stage directory mode mismatch")
        for name in expected:
            if read_source(root, name) != blobs[name] or stat.S_IMODE((root / name).stat().st_mode) != 0o644:
                raise ValueError("post-stage payload/mode mismatch")
    verify_dependencies(root, blobs)
    print("authenticated 24-file additive dependency staging complete; source52 verified")


if __name__ == "__main__":
    stage(*map(Path, sys.argv[1:]))
