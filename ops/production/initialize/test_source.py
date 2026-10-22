"""Approval source regressions; execute only in isolated fleet Docker."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from admission import source_digest


def checkout(root: Path) -> None:
    # AIDEV-NOTE: Minimal nonempty protected inputs isolate admission from unrelated application behavior.
    for relative in ("apps/server/Gemfile", "apps/server/Gemfile.lock", "ops/db/bootstrap.sql",
                     "ops/db/bootstrap-send.sql", "ops/db/bootstrap-auth-grants.sql",
                     "ops/ops820/bootstrap-gateway.sql", "ops/production/initialize/initialize.py",
                     "ops/production/initialize/admission.py", "ops/production/initialize/preflight.sql",
                     "ops/production/initialize/tenant.sql", "apps/server/db/migrate/20261023000000_test.rb"):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("protected input\n")


class SourceTest(unittest.TestCase):
    def test_excluded_ancestors_do_not_exclude_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            for ancestor in ("tmp", "log", ".bundle", "__pycache__"):
                root = Path(temporary) / ancestor / "checkout"
                checkout(root)
                before = source_digest(root)
                (root / "apps/server/Gemfile").write_text("changed input")
                self.assertNotEqual(before, source_digest(root))

    def test_location_independence_and_relative_name_binding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            first, second = Path(temporary) / "first", Path(temporary) / "second"
            checkout(first)
            checkout(second)
            self.assertEqual(source_digest(first), source_digest(second))
            file = second / "apps/server/extra.rb"
            file.write_text("same content")
            before = source_digest(second)
            file.rename(file.with_name("renamed.rb"))
            self.assertNotEqual(before, source_digest(second))

    def test_missing_empty_required_inputs_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ValueError):
                source_digest(root)
            checkout(root)
            (root / "apps/server/Gemfile").write_text("")
            with self.assertRaises(ValueError):
                source_digest(root)
            (root / "apps/server/Gemfile").unlink()
            with self.assertRaises(ValueError):
                source_digest(root)
            checkout(root)
            (root / "apps/server/db/migrate/20261023000000_test.rb").write_text("")
            with self.assertRaises(ValueError):
                source_digest(root)
            (root / "apps/server/db/migrate/20261023000000_test.rb").unlink()
            with self.assertRaises(ValueError):
                source_digest(root)

    def test_directory_and_leaf_symlinks_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            outside = Path(temporary) / "outside"
            checkout(outside)
            for relative in ("apps/server", "apps/server/db/migrate", "ops/production/initialize", "apps/server/Gemfile"):
                root = Path(temporary) / relative.replace("/", "-")
                checkout(root)
                target = root / relative
                saved = target.with_name(target.name + "-original")
                target.rename(saved)
                target.symlink_to(outside / relative, target_is_directory=saved.is_dir())
                with self.subTest(relative=relative), self.assertRaises(ValueError):
                    source_digest(root)

    def test_relative_excluded_cache_is_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            checkout(root)
            before = source_digest(root)
            cache = root / "apps/server/tmp/cache"
            cache.parent.mkdir()
            cache.write_text("not executable source")
            self.assertEqual(before, source_digest(root))


if __name__ == "__main__":
    unittest.main()
