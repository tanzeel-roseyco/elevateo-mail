"""Offline admission for the separately approved production initialization window."""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

ROLES = frozenset({"owner", "admin", "operator", "sales_manager", "sales", "auditor", "associate"})
REF = re.compile(r"[A-Za-z0-9._:/-]{16,200}\Z")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def source_digest(root: Path) -> str:
    # AIDEV-NOTE: Exclusions are checkout-relative; /tmp staging must retain the complete approval binding.
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(), "absolute regular source root required")
    resolved = root.resolve(strict=True)
    excluded = {"tmp", "log", "__pycache__", ".bundle"}

    def checked(path: Path) -> Path:
        relative = path.relative_to(root)
        require(not any(part.is_symlink() for part in (path, *path.parents) if part != root and root in part.parents),
                "symlink in approved source")
        require(path.exists(), "required source path missing")
        require(resolved in path.resolve(strict=True).parents, "source escapes approved root")
        return relative

    migrations = root / "apps/server/db/migrate"
    checked(migrations)
    migration_paths = list(migrations.glob("*.rb"))
    require(migrations.is_dir() and bool(migration_paths), "nonempty Rails migration source required")
    for path in migration_paths:
        checked(path)
        require(path.is_file() and path.stat().st_size > 0, "empty/nonregular Rails migration source")
    paths: list[Path] = []
    for relative in ("apps/server", "ops/db", "ops/production/initialize"):
        directory = root / relative
        checked(directory)
        require(directory.is_dir(), "required source directory missing: " + relative)
        selected: list[Path] = []
        for path in directory.rglob("*"):
            name = checked(path)
            if not any(part in excluded for part in name.parts) and path.is_file():
                if relative != "ops/production/initialize" or path.suffix in {".py", ".sql"}:
                    selected.append(path)
        require(bool(selected), "required source directory empty: " + relative)
        paths.extend(selected)
    for relative in ("ops/db/bootstrap.sql", "ops/db/bootstrap-send.sql", "ops/db/bootstrap-auth-grants.sql",
                     "ops/ops820/bootstrap-gateway.sql", "apps/server/Gemfile", "apps/server/Gemfile.lock",
                     "ops/production/initialize/initialize.py", "ops/production/initialize/tenant.sql",
                     "ops/production/initialize/preflight.sql", "ops/production/initialize/admission.py"):
        path = root / relative
        checked(path)
        require(path.is_file() and path.stat().st_size > 0, "required source file missing/empty: " + relative)
        paths.append(path)
    result = hashlib.sha256()
    for path in sorted(set(paths)):
        result.update(path.relative_to(root).as_posix().encode() + b"\0" + digest(path).encode() + b"\n")
    return result.hexdigest()


@dataclass(frozen=True)
class Tenant:
    organization_id: str
    user_id: str
    name: str
    role: str
    receipt: str
    subject: str

    @classmethod
    def parse(cls, values: Mapping[str, str]) -> Tenant:
        # AIDEV-NOTE: Dedicated Authentik uses user_uuid; root attests this exact subject as Tanzeel for first owner.
        for key in ("organization_id", "user_id", "subject"):
            value = values.get(key, "")
            require(str(uuid.UUID(value)) == value and uuid.UUID(value).int != 0, "canonical nonzero UUID required")
        name = values.get("name", "")
        require(1 <= len(name) <= 200 and name == name.strip() and all(ord(c) >= 32 for c in name),
                "organization name must contain 1..200 printable characters")
        require(values.get("role") in ROLES, "unrecognized organization role")
        require(REF.fullmatch(values.get("receipt", "")) is not None, "nonsecret approval receipt required")
        return cls(values["organization_id"], values["user_id"], name, values["role"], values["receipt"], values["subject"])


def approve(path: Path, root: Path, phase: str, tenant: Tenant | None) -> None:
    require(path.is_absolute() and path.is_file() and path.stat().st_size <= 16384, "bounded absolute gate file required")
    gate = json.loads(path.read_text(encoding="utf-8"))
    require(isinstance(gate, dict), "gate object required")
    require(gate.get("target") == "elevateo-mail-live/postgres" and gate.get("phase") == phase, "wrong gate target/phase")
    require(gate.get("source_sha256") == source_digest(root), "reviewed source digest mismatch")
    require(isinstance(gate.get("approval"), str) and REF.fullmatch(gate["approval"]) is not None, "approval reference required")
    for key in ("services_stopped", "outbound_held", "independent_review_passed", "isolated_restore_passed",
                "auth_storage_preserved", "restore_instructions_verified"):
        require(gate.get(key) is True, "missing operator attestation: " + key)
    # AIDEV-NOTE: Hashes prove evidence identity; root must independently accept the restore, never infer it from existence.
    for key in ("database_backup", "globals_backup", "storage_manifest", "restore_report"):
        entry = gate.get(key)
        require(isinstance(entry, dict) and isinstance(entry.get("path"), str), "missing backup evidence: " + key)
        artifact = Path(entry["path"])
        require(artifact.is_absolute() and artifact.is_file() and artifact.stat().st_size > 0, "missing evidence artifact")
        require(entry.get("sha256") == digest(artifact), "evidence digest mismatch: " + key)
    if tenant is not None and tenant.role == "owner":
        require(gate.get("verified_first_owner_is_tanzeel_ahmad") is True, "verified first-owner identity required")
    require(gate.get("tenant") == (tenant.__dict__ if tenant else None), "tenant approval mismatch")
