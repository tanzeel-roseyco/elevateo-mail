import pathlib
import tempfile
import unittest

from runtime_env import KEYS, create


class RuntimeEnvironmentTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.source = self.root / "source.env"
        self.target = self.root / "runtime.env"
        self.source.write_text("".join(f"{key}=test-value\n" for key in KEYS) + "SERVICE_ROLE_KEY=forbidden\n")

    def test_admin_key_is_excluded(self):
        create(self.source, self.target)
        result = self.target.read_text()
        self.assertNotIn("SERVICE_ROLE_KEY", result)
        self.assertEqual(set(line.partition("=")[0] for line in result.splitlines()), KEYS)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)

    def test_missing_runtime_secret_rejected(self):
        self.source.write_text("SERVICE_ROLE_KEY=forbidden\n")
        with self.assertRaisesRegex(ValueError, "missing"):
            create(self.source, self.target)
        self.assertFalse(self.target.exists())

    def test_duplicate_runtime_secret_rejected(self):
        self.source.write_text(self.source.read_text() + "API_DB_PASSWORD=duplicate\n")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            create(self.source, self.target)


if __name__ == "__main__":
    unittest.main()
