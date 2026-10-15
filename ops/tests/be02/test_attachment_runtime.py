"""Docker-only acceptance-profile ownership and private-credential regressions."""
from __future__ import annotations

import base64
import copy
import hashlib
import hmac
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import attachment_runtime as runtime
from cleanup import cleanup
from docker_task import Task


class AttachmentRuntimeTest(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.task = Task(self.root, self.root, "be02-fixture", "default",
                         {"BE02_FIXTURE_SIGNING_SECRET": "f" * 64})
        self.task.env_file.write_text("EXISTING=preserved\n", encoding="ascii")

    def test_private_configuration_and_signed_roles(self) -> None:
        with patch.object(runtime.time, "time", return_value=1000):
            runtime.configure(self.task)
        self.assertEqual(self.task.env_file.stat().st_mode & 0o777, 0o600)
        self.assertTrue(self.task.env_file.read_text().startswith("EXISTING=preserved\n"))
        self.assertIn(self.root / "ops/tests/be02/attachments.yaml", self.task.compose_files)
        self.assertEqual(len(base64.b64decode(self.task.secrets["ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64"])), 32)
        for key, role in (("BE02_STORAGE_ANON", "anon"), ("BE02_STORAGE_SERVICE", "service_role")):
            value = self.task.secrets[key]
            header, payload, signature = value.split(".")
            decode = lambda text: base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
            self.assertEqual(json.loads(decode(header)), {"alg": "HS256", "typ": "JWT"})
            self.assertEqual(json.loads(decode(payload)), {"role": role, "iss": "supabase", "iat": 1000, "exp": 4600})
            self.assertEqual(decode(signature), hmac.new(b"f" * 64, f"{header}.{payload}".encode(), hashlib.sha256).digest())
            self.assertNotIn(value, self.task.redact(value))

    def test_unavailable_image_is_not_pulled_or_started(self) -> None:
        with patch.object(self.task, "inspect", side_effect=RuntimeError("missing image")), \
             patch.object(self.task, "docker") as docker, patch.object(self.task, "compose") as compose:
            with self.assertRaisesRegex(RuntimeError, "missing image"):
                runtime.preflight(self.task)
            docker.assert_not_called()
            compose.assert_not_called()

    def container(self, service: str = "storage") -> dict:
        # AIDEV-NOTE: Docker inspect fixtures intentionally retain the heterogeneous external JSON structure.
        return {"Id": service, "Config": {"Labels": {"com.docker.compose.service": service},
                "Image": self.task.image if service == "attachment-gateway" else runtime.PINS[service]},
                "HostConfig": {"ReadonlyRootfs": True, "PortBindings": {}}, "Mounts": []}

    def test_admits_exact_private_services(self) -> None:
        for service in runtime.SERVICES:
            runtime.validate_container(self.task, self.container(service))

    def test_refuses_foreign_image_writable_root_ports_and_volumes(self) -> None:
        original = self.container()
        variants = [copy.deepcopy(original) for _ in range(4)]
        variants[0]["Config"]["Image"] = "foreign:image"
        variants[1]["HostConfig"]["ReadonlyRootfs"] = False
        variants[2]["HostConfig"]["PortBindings"] = {"5000/tcp": [{"HostPort": "5000"}]}
        variants[3]["Mounts"] = [{"Type": "volume", "Name": "foreign"}]
        for variant in variants:
            with self.subTest(variant=variant), self.assertRaises(RuntimeError):
                runtime.validate_container(self.task, variant)

    def test_cleanup_validates_all_containers_before_removing_any(self) -> None:
        valid, invalid = self.container(), self.container("clamav")
        invalid["Mounts"] = [{"Type": "bind", "Source": "/foreign", "RW": False}]
        with patch.object(self.task, "project_containers", return_value=[valid, invalid]), \
             patch.object(self.task, "docker", return_value="") as docker, \
             patch.object(self.task, "inspect", return_value=[]):
            self.assertFalse(cleanup(self.task))
        self.assertFalse(any(call.args[0] == "remove-container" for call in docker.call_args_list))
        receipt = json.loads((self.root / "cleanup.json").read_text())
        self.assertIn("unknown or writable source mount", receipt["errors"][0])

    def test_attachment_failure_propagates(self) -> None:
        with patch.object(self.task, "compose", side_effect=["", RuntimeError("fixture failed")]) as compose:
            with self.assertRaisesRegex(RuntimeError, "fixture failed"):
                runtime.run(self.task)
        self.assertEqual(compose.call_count, 2)


if __name__ == "__main__":
    unittest.main()
