"""Guard acceptance evidence against optimized-away assertions and a changed binary."""
from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class RuntimeGuardTest(unittest.TestCase):
    def test_optimized_entrypoint_rejected_before_mutation(self) -> None:
        result = subprocess.run([sys.executable, '-O', str(Path(__file__).with_name('runtime_acceptance.py'))],
                                capture_output=True, timeout=10, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'requires Python without optimization', result.stderr)

    def test_changed_binary_rejected_even_with_optimization(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'not-mox'
            path.write_bytes(b'changed binary')
            result = subprocess.run([sys.executable, '-O', '-c',
                                     'from pathlib import Path; from runtime_acceptance import verify_binary; '
                                     'import sys; verify_binary(Path(sys.argv[1]))', str(path)],
                                    capture_output=True, timeout=10, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'does not match the reviewed pin', result.stderr)


if __name__ == '__main__':
    unittest.main()
