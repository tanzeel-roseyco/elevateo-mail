"""Offline admission regressions; run only inside the final Docker gate."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from mox_protocol import wait_ready


class MoxAdmissionTest(unittest.TestCase):
    # AIDEV-NOTE: These isolate pre-Ruby failures; the four real Ruby cases remain the protocol acceptance gate.
    def test_ready_fixture_admits_ruby(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            ready = Path(directory) / 'ready'
            ready.touch()
            process = Mock()
            process.poll.return_value = None
            wait_ready(process, ready)
            process.poll.assert_called_once_with()

    def test_exited_fixture_fails_before_ruby(self) -> None:
        process = Mock()
        process.poll.return_value = 1
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, 'before Ruby'):
                wait_ready(process, Path(directory) / 'ready')

    def test_exited_fixture_with_ready_marker_is_rejected(self) -> None:
        process = Mock()
        process.poll.return_value = 1
        with tempfile.TemporaryDirectory() as directory:
            ready = Path(directory) / 'ready'
            ready.touch()
            with self.assertRaisesRegex(RuntimeError, 'before Ruby'):
                wait_ready(process, ready)

    def test_unready_fixture_has_absolute_deadline(self) -> None:
        process = Mock()
        process.poll.return_value = None
        with tempfile.TemporaryDirectory() as directory:
            with patch('mox_protocol.time.monotonic', side_effect=[0.0, 91.0]):
                with self.assertRaises(TimeoutError):
                    wait_ready(process, Path(directory) / 'ready')


if __name__ == '__main__':
    unittest.main()
