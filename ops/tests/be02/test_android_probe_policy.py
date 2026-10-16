"""The probe is the only permitted host-network service; command and live ports fail closed."""
from __future__ import annotations
import unittest
from unittest.mock import Mock
from acceptance_cleanup import validate_container


class AndroidProbePolicyTests(unittest.TestCase):
    def fixture(self, service: str = "android-probe") -> tuple[Mock, dict[str, object]]:
        task = Mock(project="android-test", acceptance_uid=1001, acceptance_gid=1001, secrets={})
        task.acceptance_mounts = {service: set()}
        task.acceptance_images = {service: "sha256:fixed"}
        ports = {"19443/tcp": [{"HostIp": "127.0.0.1", "HostPort": "19443"}]} if service == "android-connect" else {}
        item = {"Image": "sha256:fixed", "Mounts": [], "State": {"Running": True},
            "NetworkSettings": {"Ports": ports},
            "Config": {"Labels": {"com.docker.compose.service": service}, "User": "1001:1001",
                "Cmd": ["python3", "-I", "-B", "/probe.py"], "Entrypoint": None},
            "HostConfig": {"ReadonlyRootfs": True, "CapDrop": ["ALL"], "PortBindings": ports,
                "NetworkMode": "host" if service == "android-probe" else "android-test_isolated",
                "LogConfig": {"Type": "none"}, "Memory": 128 * 1024**2, "NanoCpus": 1_000_000_000,
                "PidsLimit": 64, "Tmpfs": {}, "SecurityOpt": ["no-new-privileges:true"]}}
        return task, item

    def test_probe_exact_policy_and_connected_loopback_are_accepted(self) -> None:
        for service in ("android-probe", "android-connect"):
            task, item = self.fixture(service)
            validate_container(task, item)

    def test_probe_command_entrypoint_network_and_writable_mount_are_rejected(self) -> None:
        for section, key, value in (("Config", "Cmd", ["python3", "-c", "print(1)"]),
                ("Config", "Entrypoint", ["sh"]), ("HostConfig", "NetworkMode", "android-test_isolated"),
                ("HostConfig", "Privileged", True), ("HostConfig", "Memory", 0)):
            with self.subTest(key=key):
                task, item = self.fixture()
                item[section][key] = value
                with self.assertRaises(RuntimeError):
                    validate_container(task, item)
        task, item = self.fixture()
        item["Mounts"] = [{"Type": "bind", "Source": "/tmp", "Destination": "/secret", "RW": True}]
        with self.assertRaises(RuntimeError):
            validate_container(task, item)

    def test_other_services_cannot_use_host_network_or_missing_live_bindings(self) -> None:
        for section, key, value in (("HostConfig", "NetworkMode", "host"),
                                   ("NetworkSettings", "Ports", {})):
            task, item = self.fixture("android-connect")
            item[section][key] = value
            with self.assertRaises(RuntimeError):
                validate_container(task, item)


if __name__ == "__main__":
    unittest.main()
