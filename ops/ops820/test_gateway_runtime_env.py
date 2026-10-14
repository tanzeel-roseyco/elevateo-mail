"""Boundary cases for Soren's disposable Python Docker batch."""
import pathlib
import tempfile
import unittest

from gateway_runtime_env import create
from make_test_env import make


class GatewayRuntimeEnvironmentTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.source = pathlib.Path(temp.name) / "source.env"
        self.destination = pathlib.Path(temp.name) / "gateway.env"
        make(self.source)

    def test_restricted_output(self):
        create(self.source, self.destination)
        result = self.destination.read_text()
        self.assertIn("ELEVATEO_PROCESS=attachment_gateway\n", result)
        self.assertIn("ELEVATEO_ATTACHMENT_GATEWAY_DATABASE_URL=postgres://elevateo_attachment_gateway:", result)
        self.assertNotIn("API_DB_PASSWORD=", result)
        self.assertNotIn("MIGRATOR_DB_PASSWORD=", result)
        self.assertEqual(self.destination.stat().st_mode & 0o777, 0o600)

    def test_duplicate_gateway_password_rejected(self):
        with self.source.open("a") as stream:
            stream.write("ATTACHMENT_GATEWAY_DB_PASSWORD=extra\n")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            create(self.source, self.destination)
        self.assertFalse(self.destination.exists())

    def test_non_disposable_stack_rejected(self):
        self.source.write_text(self.source.read_text().replace("OPS820_TASK_OWNED=1", "OPS820_TASK_OWNED=0"))
        with self.assertRaisesRegex(ValueError, "disposable"):
            create(self.source, self.destination)
        self.assertFalse(self.destination.exists())


if __name__ == "__main__":
    unittest.main()
