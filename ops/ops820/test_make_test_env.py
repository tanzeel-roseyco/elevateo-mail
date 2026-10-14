import pathlib
import tempfile
import unittest

from make_test_env import make


class PrivateEnvironmentTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = pathlib.Path(self.temp.name) / "private.env"

    def test_fresh_unique_and_private(self):
        make(self.path)
        first = self.path.read_text()
        self.assertIn("OPS820_TASK_OWNED=1\n", first)
        self.assertIn("STACK_ID=elevateo-mail-test\n", first)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        make(self.path.with_name("second.env"))
        self.assertNotEqual(first, self.path.with_name("second.env").read_text())

    def test_existing_file_is_preserved(self):
        self.path.write_text("sentinel")
        with self.assertRaises(FileExistsError):
            make(self.path)
        self.assertEqual(self.path.read_text(), "sentinel")

    def test_relative_path_rejected(self):
        with self.assertRaisesRegex(ValueError, "absolute"):
            make(pathlib.Path("private.env"))


if __name__ == "__main__":
    unittest.main()
