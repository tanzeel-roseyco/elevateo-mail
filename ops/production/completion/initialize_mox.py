"""Initialize empty named volumes with held Mox accounts and environment-supplied TLS material."""
from __future__ import annotations

import argparse
import base64
import io
import ipaddress
import json
from pathlib import Path
import sys
import ssl
import tarfile
import tempfile

from assignments import Assignment, load
from common import compose, helper_image, required, run

# AIDEV-NOTE: Keep completion modules first; selfhosted-mail also defines a different provision module.
sys.path.append(str(Path(__file__).resolve().parents[2] / "selfhosted-mail"))
from validation import fqdn  # noqa: E402


def configuration(items: list[Assignment]) -> dict[str, bytes]:
    hostname = fqdn(required("ELEVATEO_MOX_HOSTNAME"))
    address = ipaddress.IPv4Address(required("ELEVATEO_MOX_IPV4"))
    if not address.is_global or address.is_multicast:
        raise ValueError("globally routable Mox address required")
    domains = sorted(set(fqdn(value) for value in required("ELEVATEO_MAIL_DOMAINS").split(",")))
    workspace = set(fqdn(value) for value in required("ELEVATEO_WORKSPACE_DOMAINS").split(","))
    if set(domains) & workspace or hostname in workspace or not any(hostname.endswith("." + d) for d in domains):
        raise ValueError("mail domains must exclude Workspace and contain Mox hostname")
    if {item.address.split("@")[1] for item in items} != set(domains):
        raise ValueError("assignment domains must exactly match approved mail domains")
    # AIDEV-NOTE: Same held Mox dialect as selfhosted-mail/generate.py; no DNS or runtime activation is performed.
    static = f"""DataDir: ../data
User: 1000
LogLevel: info
Hostname: {hostname}
QuotaMessageSize: 10485760
Postmaster:
\tAccount: {items[0].address}
\tMailbox: Inbox
Listeners:
\tpublic:
\t\tIPs:
\t\t\t- {address}
\t\tTLS:
\t\t\tKeyCerts:
\t\t\t\t-
\t\t\t\t\tCertFile: ../tls/fullchain.pem
\t\t\t\t\tKeyFile: ../tls/privkey.pem
\t\tSMTP:
\t\t\tEnabled: true
\t\t\tPort: 25
\t\tSubmission:
\t\t\tEnabled: true
\t\t\tPort: 587
\t\tIMAPS:
\t\t\tEnabled: true
\t\t\tPort: 993
"""
    dynamic = ["Domains:"]
    for domain in domains:
        dynamic.extend([f"\t{domain}:", "\t\tDisabled: true"])
    dynamic.append("Accounts:")
    for item in sorted(items, key=lambda a: a.address):
        dynamic.extend([f"\t{item.address}:", f"\t\tDomain: {item.address.split('@')[1]}",
                        "\t\tLoginDisabled: activation pending", "\t\tMaxOutgoingMessagesPerDay: 30",
                        "\t\tMaxFirstTimeRecipientsPerDay: 10", "\t\tDestinations:", f"\t\t\t{item.address}: nil"])
    return {"mox.conf": static.encode(), "domains.conf": ("\n".join(dynamic) + "\n").encode()}


def tls_material() -> dict[str, bytes]:
    result: dict[str, bytes] = {}
    for name, variable, label in [("fullchain.pem", "ELEVATEO_MOX_TLS_CERT_BASE64", b"CERTIFICATE"),
                                  ("privkey.pem", "ELEVATEO_MOX_TLS_KEY_BASE64", b"PRIVATE KEY")]:
        value = base64.b64decode(required(variable), validate=True)
        if not 64 <= len(value) <= 65536 or b"-----BEGIN " not in value or label + b"-----" not in value:
            raise ValueError("bounded PEM TLS credentials required")
        result[name] = value
    # AIDEV-NOTE: Parse and match the key before persisting either volume; PEM markers alone admit unusable credentials.
    with tempfile.TemporaryDirectory(prefix="elevateo-tls-") as directory:
        for name, value in result.items():
            path = Path(directory) / name
            path.touch(mode=0o600)
            path.write_bytes(value)
        try:
            ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER).load_cert_chain(
                str(Path(directory) / "fullchain.pem"), str(Path(directory) / "privkey.pem"), password="")
        except (ssl.SSLError, OSError):
            raise ValueError("TLS certificate and unencrypted matching key required") from None
    return result


def archive(files: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as stream:
        for name, data in sorted(files.items()):
            entry = tarfile.TarInfo(name)
            entry.size, entry.mode, entry.uid, entry.gid = len(data), 0o600, 1000, 1000
            stream.addfile(entry, io.BytesIO(data))
    return output.getvalue()


def initialize(items: list[Assignment]) -> None:
    configs, tls = configuration(items), tls_material()
    project = compose()[3]
    image = helper_image()
    pending: list[tuple[str, dict[str, bytes]]] = []
    existing = set(run(["docker", "volume", "ls", "-q"]).decode().splitlines())
    for key, files in [("mox-config", configs), ("mox-tls", tls)]:
        volume = f"{project}_{key}"
        if run(["docker", "ps", "-q", "--filter", f"volume={volume}"]).strip():
            raise ValueError("Mox volumes must be offline for initialization")
        if volume in existing:
            labels = json.loads(run(["docker", "volume", "inspect", volume]))[0].get("Labels", {})
            if labels.get("com.docker.compose.project") != project or labels.get("com.docker.compose.volume") != key:
                raise ValueError("foreign volume ownership")
            raw = run(["docker", "run", "--rm", "--network", "none", "--entrypoint", "tar", "--mount",
                       f"type=volume,source={volume},target=/target,readonly", image, "-cf", "-", "-C", "/target", "."])
            with tarfile.open(fileobj=io.BytesIO(raw)) as saved:
                members = [entry for entry in saved.getmembers() if entry.name not in {".", "./"}]
                actual: dict[str, bytes] = {}
                for entry in members:
                    source = saved.extractfile(entry) if entry.isfile() and entry.size <= 65536 else None
                    if source is None:
                        raise ValueError("unexpected existing configuration")
                    actual[entry.name.removeprefix("./")] = source.read()
                if actual == files:
                    continue
                if actual:
                    raise ValueError("existing Mox configuration differs; no overwrite permitted")
        pending.append((key, files))
    # AIDEV-NOTE: Exact retries succeed; validate both existing volumes before creating or writing either one.
    for key, files in pending:
        volume = f"{project}_{key}"
        run(["docker", "volume", "create", "--label", f"com.docker.compose.project={project}",
             "--label", f"com.docker.compose.volume={key}", volume])
        run(["docker", "run", "--rm", "-i", "--network", "none", "--entrypoint", "sh", "--mount",
             f"type=volume,source={volume},target=/target", image, "-ec",
             'test -z "$(ls -A /target)"; tar -xpf - -C /target'], archive(files))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, required=True)
    args = parser.parse_args()
    try:
        initialize(load(args.csv))
        print("held Mox configuration initialized")
    except (ValueError, RuntimeError, OSError):
        raise SystemExit("Mox initialization rejected; private details withheld") from None
