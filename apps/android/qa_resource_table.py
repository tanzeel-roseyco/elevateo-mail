"""Bind the isolated QA trust resources to the pinned SDK's compiled resource table."""
import re

PACKAGE = "com.elevateo.mail.qa"
PATHS = {
    "xml/elevateo_qa_network_security": "res/xml/elevateo_qa_network_security.xml type=XML",
    "raw/elevateo_qa_ca": "res/raw/elevateo_qa_ca.pem",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def resource_bindings(dump: str) -> dict[str, str]:
    # AIDEV-NOTE: Fail closed on protected-entry format changes; an arbitrary numeric ref proves no trust binding.
    require(0 < len(dump) <= 8_000_000, "resource dump size outside bounds")
    package, package_id, type_name, type_id = "", "", "", ""
    package_count = 0
    entries: dict[str, tuple[str, list[str]]] = {}
    ids: list[str] = []
    active: str | None = None
    for line in dump.splitlines():
        if line.startswith("Package "):
            match = re.fullmatch(r"Package name=([A-Za-z0-9_.]+) id=([0-9a-f]{2})", line)
            require(match is not None, "unsupported resource package")
            assert match is not None
            package, package_id = match.groups()
            package_count += int(package == PACKAGE)
            type_name, type_id, active = "", "", None
        elif line.startswith("  type "):
            match = re.fullmatch(r"  type ([a-z0-9_]+) id=([0-9a-f]{2}) entryCount=([0-9]+)", line)
            require(match is not None, "unsupported resource type")
            assert match is not None
            type_name, type_id = match.group(1), match.group(2)
            active = None
        elif line.startswith("    resource "):
            # AIDEV-NOTE: AAPT2 generates $-prefixed drawable names; protected trust names still match exact PATHS.
            match = re.fullmatch(r"    resource (0x[0-9a-f]{8}) ([a-z0-9_]+/[A-Za-z0-9_.$]+)(.*)", line)
            require(match is not None, "unsupported resource identity")
            assert match is not None
            identity, name, flags = match.groups()
            ids.append(identity)
            active = None
            if package == PACKAGE and name in PATHS:
                require(name not in entries, "duplicate protected resource")
                require(not flags, "unreviewed protected resource flags")
                require(identity[2:4] == package_id and identity[4:6] == type_id
                        and name.split("/")[0] == type_name, "resource owner/type mismatch")
                entries[name] = (identity, [])
                active = name
        elif active is not None and line.strip():
            entries[active][1].append(line)
    require(package_count == 1 and set(entries) == set(PATHS), "missing or duplicated QA resource package")
    for name, (identity, values) in entries.items():
        require(ids.count(identity) == 1, "duplicate protected resource ID")
        # AIDEV-NOTE: Only a single default file is allowed; aliases and alternate trust configurations need review.
        expected = ["      () (file) " + PATHS[name]]
        require(values in (expected, expected + ["      Flag disabled values:"]),
                "protected resource path/configuration differs")
    return {name: "@ref/" + identity for name, (identity, _) in entries.items()}


def bound_reference(value: str | None, name: str, bindings: dict[str, str]) -> bool:
    return value in ("@" + name, bindings[name])
