"""Regression: failure starting the relay must terminate an already-started emulator."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import boot


class StartupTest(unittest.TestCase):
    def test_second_child_startup_failure_terminates_first(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory) / 'work'; evidence = Path(directory) / 'evidence'
            work.mkdir(); evidence.mkdir()
            emulator = Mock(); emulator.poll.return_value = None
            with patch.object(boot, 'WORK', work), patch.object(boot, 'EVIDENCE', evidence), \
                    patch.object(boot.subprocess, 'run'), \
                    patch.object(boot.subprocess, 'Popen', side_effect=[emulator, OSError('startup')]):
                with self.assertRaisesRegex(OSError, 'startup'):
                    boot.main()
            emulator.terminate.assert_called_once_with()
            emulator.wait.assert_called_once_with(timeout=10)

    def test_successful_startup_reaches_boot_and_install(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory) / 'work'; evidence = Path(directory) / 'evidence'
            work.mkdir(); evidence.mkdir()
            emulator, relay = Mock(), Mock()
            emulator.poll.return_value = relay.poll.return_value = None
            with patch.object(boot, 'WORK', work), patch.object(boot, 'EVIDENCE', evidence), \
                    patch.object(boot.subprocess, 'run'), \
                    patch.object(boot.subprocess, 'Popen', side_effect=[emulator, relay]), \
                    patch.object(boot.signal, 'signal'), \
                    patch.object(boot.time, 'monotonic', side_effect=[0, 1, 0, 3601]), \
                    patch.object(boot, 'adb', return_value='1') as adb:
                boot.main()
            adb.assert_any_call('shell', 'getprop', 'sys.boot_completed', timeout=5)
            adb.assert_any_call('install', '--no-streaming', '/apk/elevateo.apk', timeout=180)
            self.assertTrue((evidence / 'emulator-ready.json').is_file())
            emulator.terminate.assert_called_once_with(); relay.terminate.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
