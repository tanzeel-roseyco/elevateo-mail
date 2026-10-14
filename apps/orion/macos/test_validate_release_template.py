"""Offline static validator cases; execution delegated to Soren."""
import json
import tempfile
import unittest
from pathlib import Path

from validate_release_template import REQUIRED, validate


class TemplateValidationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "release-template.json"

    def test_valid_template(self):
        self.path.write_text(json.dumps(REQUIRED), encoding="utf-8")
        self.assertEqual([], validate(self.path))

    def test_rejects_incorrect_architecture(self):
        data = {**REQUIRED, "target": "aarch64-apple-darwin"}
        self.path.write_text(json.dumps(data), encoding="utf-8")
        self.assertIn("target: expected 'universal-apple-darwin'", validate(self.path))

    def test_rejects_credential_field(self):
        self.path.write_text(json.dumps({**REQUIRED, "api_key": "placeholder"}), encoding="utf-8")
        self.assertTrue(validate(self.path))


if __name__ == "__main__":
    unittest.main()
