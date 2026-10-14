import pathlib
import tempfile
import unittest

from runtime_env import KEYS, ROLE_KEYS, create


class RuntimeEnvironmentTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.source = self.root / "source.env"
        self.target = self.root / "runtime.env"
        self.source.write_text("".join(f"{key}=test-value\n" for key in KEYS) +
                               "AUTH_PORT=18310\nSERVICE_ROLE_KEY=forbidden\n")

    def test_admin_key_is_excluded(self):
        create(self.source, self.target, "api")
        result = self.target.read_text()
        self.assertNotIn("SERVICE_ROLE_KEY", result)
        self.assertEqual(set(line.partition("=")[0] for line in result.splitlines()),
                         ROLE_KEYS["api"] | {"ELEVATEO_AUTH_JWT_ISSUER"})
        self.assertIn("ELEVATEO_AUTH_JWT_ISSUER=http://127.0.0.1:18310\n", result)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)

    def test_missing_runtime_secret_rejected(self):
        self.source.write_text("SERVICE_ROLE_KEY=forbidden\n")
        with self.assertRaisesRegex(ValueError, "missing runtime secret"):
            create(self.source, self.target, "api")
        self.assertFalse(self.target.exists())

    def test_duplicate_runtime_secret_rejected(self):
        self.source.write_text(self.source.read_text() + "API_DB_PASSWORD=duplicate\n")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            create(self.source, self.target, "api")

    def test_wrong_auth_issuer_port_rejected(self):
        self.source.write_text(self.source.read_text().replace("AUTH_PORT=18310", "AUTH_PORT=9999"))
        with self.assertRaisesRegex(ValueError, "invalid disposable Auth port"):
            create(self.source, self.target, "api")

    def test_roles_receive_distinct_credentials(self):
        for role in ("migrator", "worker"):
            target = self.root / f"{role}.env"
            create(self.source, target, role)
            result = target.read_text()
            self.assertEqual(set(line.partition("=")[0] for line in result.splitlines()),
                             ROLE_KEYS[role] | ({"ELEVATEO_AUTH_JWT_ISSUER"} if role != "migrator" else set()))
            self.assertNotIn("API_DB_PASSWORD", result)


if __name__ == "__main__":
    unittest.main()
