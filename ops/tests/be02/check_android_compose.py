"""Real Compose parser regression; run in a fleet container with /compose mounted read-only."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory


def main() -> None:
    root = Path("/source")
    base = (root / "ops/compose.be02-test.yaml").read_text()
    overlay = (root / "ops/compose.android-test.yaml").read_text()
    keys = set(re.findall(r"\$\{([A-Z_0-9]+)", base + overlay))
    # AIDEV-NOTE: The parser receives synthetic placeholders only, no Docker socket or application secrets.
    env = {"PATH": "/usr/bin:/bin", "HOME": "/tmp", **{key: "a" * 64 for key in keys}}
    env.update(BE02_SOURCE=str(root), BE02_PROJECT="android-compose-regression",
        BE02_SERVER_IMAGE="diagnostic:server", BE02_ACCEPTANCE_WEB_IMAGE="diagnostic:web",
        BE02_ANDROID_SOCKET_DIR="/unused/socket", BE02_ANDROID_TLS="/unused/tls", BE02_ACCEPTANCE_PRIVATE="/unused/private",
        BE02_ACCEPTANCE_UID="1001", BE02_ACCEPTANCE_GID="1001")
    with TemporaryDirectory() as directory:
        folder = Path(directory)
        (folder / "compose.be02-test.yaml").write_text(base)
        target = folder / "compose.android-test.yaml"
        target.write_text(overlay)
        args = ["/compose", "--project-name", "android-compose-regression", "--env-file", "/dev/null",
            "-f", str(folder / "compose.be02-test.yaml"), "-f", str(target), "config", "--format", "json"]
        def parse(values: dict[str, str]) -> subprocess.CompletedProcess[str]:
            return subprocess.run(args, env=values, capture_output=True, text=True, timeout=15)
        result = parse(env)
        if result.returncode:
            raise RuntimeError("Compose failed with synthetic values: " + result.stderr[:2000])
        document = json.loads(result.stdout)
        services = document["services"]
        probe = services["android-probe"]
        assert probe["network_mode"] == "none" and not probe.get("networks")
        assert not probe.get("ports")
        assert set(services["android-connect"]["networks"]) == {"isolated"}
        assert set(services["android-web"]["networks"]) == {"isolated"}
        assert document["networks"]["isolated"]["internal"] is True
        published = [(name, port) for name, service in services.items() for port in service.get("ports", [])]
        assert published == []
        for service, readonly in (("android-connect", False), ("android-probe", True)):
            mount = [m for m in services[service]["volumes"] if m["target"] == "/relay"]
            assert len(mount) == 1 and mount[0]["source"] == "/unused/socket"
            assert mount[0].get("read_only", False) is readonly
        for name in ("api", "worker"):
            settings = services[name]["environment"]
            assert settings["ELEVATEO_BROWSER_ORIGIN"] == "https://elevateo.qa.internal"
            assert settings["ELEVATEO_COOKIE_SECURE"] == "true"
            assert settings.get("ELEVATEO_LOCAL_HTTP") is None
        # AIDEV-NOTE: Recreate the rejected anchor shape to prove this test catches the actual runtime failure.
        broken = overlay.replace("x-android-edge: &edge\n", "x-android-edge: &edge\n  networks: [isolated]\n")
        target.write_text(broken)
        result = parse(env)
        assert result.returncode != 0 and "mutually exclusive" in result.stderr
        target.write_text(overlay)
        for key in ("BE02_ACCEPTANCE_WEB_IMAGE", "BE02_ANDROID_SOCKET_DIR"):
            missing = dict(env)
            del missing[key]
            result = parse(missing)
            assert result.returncode != 0 and key in result.stderr
        print(json.dumps({"status": "PASSED", "checks": ["resolved-network-boundaries",
            "https-cookie-settings", "original-network-conflict-rejected", "missing-image-and-socket-rejected", "unix-mount-modes"]}))


if __name__ == "__main__":
    main()
