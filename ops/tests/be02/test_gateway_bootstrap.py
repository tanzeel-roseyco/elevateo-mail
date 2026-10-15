"""Gateway admission keeps credentials isolated and attests the real privileged SQL."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from docker_task import Task
from run import source_hashes


class GatewayBootstrapTest(unittest.TestCase):
    # AIDEV-NOTE: Inspect fixtures model accidental credential propagation into either live application role.
    def test_runtime_rejects_gateway_credentials_in_both_roles(self) -> None:
        task = Task(Path("/source"), Path("/evidence"), "synthetic", "default", {})
        for service, password in (("api", "API_DB_PASSWORD"), ("worker", "WORKER_DB_PASSWORD")):
            with self.subTest(service=service):
                config = {"Config": {"Labels": {"com.docker.compose.service": service},
                                     "Env": [password + "=synthetic"]}}
                with patch.object(task, "project_containers", return_value=[config]):
                    task.runtime_credentials()
                    config["Config"]["Env"].append("ATTACHMENT_GATEWAY_DB_PASSWORD=synthetic")
                    with self.assertRaisesRegex(RuntimeError, "received forbidden credentials"):
                        task.runtime_credentials()

    def test_gateway_sql_drift_changes_attested_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "ops/ops820/bootstrap-gateway.sql"
            script.parent.mkdir(parents=True)
            script.write_text("SELECT 1;\n", encoding="utf-8")
            (root / "ops/compose.be02-test.yaml").write_text("services: {}\n", encoding="utf-8")
            before = source_hashes(root)
            script.write_text("SELECT 2;\n", encoding="utf-8")
            after = source_hashes(root)
            name = "ops/ops820/bootstrap-gateway.sql"
            self.assertNotEqual(before[name], after[name])
            script.unlink()
            with self.assertRaises(FileNotFoundError):
                source_hashes(root)


if __name__ == "__main__":
    unittest.main()
