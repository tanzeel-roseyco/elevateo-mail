"""Regression checks for the real fixture-expiry and evidence acceptance boundary."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import runtime

CHECKS = ('login', 'inbox', 'thread', 'navigation', 'rotation', 'lifecycle', 'offline', 'logout')


class RuntimeTest(unittest.TestCase):
    def exercise(self, *, expiry: int = 1200, done: bool = True, result: object = None, late: bool = False) -> tuple[Mock, Path]:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        base = Path(directory.name); root = base / 'root'; control = base / 'control'; evidence = base / 'evidence'
        evidence.mkdir(); control.mkdir(); (evidence / 'emulator-ready.json').write_text('{}')
        fixture_evidence = root / 'ops/local' / ('be02-' + 'a' * 32); fixture_evidence.mkdir(parents=True)
        (fixture_evidence / 'android-ready.json').write_text(json.dumps({'status': 'READY', 'expires_at': expiry}))
        tls = control / 'qa815-artifacts/android1031-qa-r2-94e8afbee937'; tls.mkdir(parents=True)
        (tls / 'ca.pem').write_text('synthetic-public-ca')
        if done:
            (evidence / 'acceptance-done').touch()
            (evidence / 'acceptance-result.json').write_text(json.dumps(result))
        process = Mock(); process.poll.return_value = None; process.returncode = 0
        def start(_args: list[str], **kwargs: object) -> Mock:
            self.assertEqual(_args[_args.index('--expect-host') + 1], 'Ubuntu-noble-latest-amd64-base')
            self.assertEqual(_args[_args.index('--android-socket-dir') + 1], str(base / 'relay'))
            log = kwargs['stdout']
            log.write('BE02 project=' + fixture_evidence.name + ' evidence=' + str(fixture_evidence) + '\n')
            log.flush()
            return process
        # AIDEV-NOTE: Advance beyond the derived GUI window without sleeping or launching any process.
        with patch.object(runtime.subprocess, 'Popen', side_effect=start), \
                patch.object(runtime.time, 'time', return_value=1000), \
                patch.object(runtime.time, 'monotonic', side_effect=[0, 0, 1, 2, 900] if late else [0, 0, 1, 2, 3, 4, 900]):
            try:
                runtime.exercise(root, control, evidence, 'owned-emulator', base / 'relay', Mock(), Mock())
            finally:
                self.assertTrue((fixture_evidence / 'android-stop').is_file())
                process.wait.assert_called_once_with(timeout=300)
                self.assertEqual(json.loads((control / 'android1035-active.json').read_text())['status'], 'CLOSED')
        return process, evidence

    def test_complete_eight_checks_accept(self) -> None:
        self.exercise(result={'status': 'PASSED', 'checks': dict.fromkeys(CHECKS, 'PASSED')})

    def test_expired_fixture_rejects_even_complete_result(self) -> None:
        with self.assertRaisesRegex(RuntimeError, 'no GUI acceptance budget'):
            self.exercise(expiry=1020, result={'status': 'PASSED', 'checks': dict.fromkeys(CHECKS, 'PASSED')})

    def test_missing_completion_never_passes_at_deadline(self) -> None:
        with self.assertRaisesRegex(RuntimeError, 'deadline reached without completion'):
            self.exercise(done=False)

    def test_missing_or_failed_check_rejected(self) -> None:
        for checks in [dict.fromkeys(CHECKS[:-1], 'PASSED'), {**dict.fromkeys(CHECKS, 'PASSED'), 'login': 'FAILED'}]:
            with self.subTest(checks=checks), self.assertRaisesRegex(RuntimeError, 'checks did not pass'):
                self.exercise(result={'status': 'PASSED', 'checks': checks})

    def test_overall_failure_rejected(self) -> None:
        with self.assertRaisesRegex(RuntimeError, 'checks did not pass'):
            self.exercise(result={'status': 'FAILED', 'checks': dict.fromkeys(CHECKS, 'PASSED')})


    def test_stop_marker_failure_still_interrupts_and_reaps_fixture(self) -> None:
        process = Mock(); process.poll.return_value = None; process.returncode = 0
        original = RuntimeError('acceptance failure')
        marker_error = OSError('synthetic full disk')
        with patch.object(Path, 'touch', side_effect=marker_error), patch.object(Path, 'write_text'):
            with self.assertRaises(BaseExceptionGroup) as caught:
                runtime.stop_fixture(process, Path('/fixture'), Path('/control'), Path('/evidence'), original)
        self.assertEqual(caught.exception.exceptions, (original, marker_error))
        process.send_signal.assert_called_once_with(runtime.signal.SIGINT)
        process.wait.assert_called_once_with(timeout=300)

    def test_stalled_fixture_is_killed_even_when_closed_marker_fails(self) -> None:
        process = Mock(); process.poll.return_value = None; process.returncode = -9
        process.wait.side_effect = [runtime.subprocess.TimeoutExpired('fixture', 300),
                                   runtime.subprocess.TimeoutExpired('fixture', 300), -9]
        with patch.object(Path, 'touch'), patch.object(Path, 'write_text', side_effect=OSError('synthetic disk failure')):
            with self.assertRaises(BaseExceptionGroup) as caught:
                runtime.stop_fixture(process, Path('/fixture'), Path('/control'), Path('/evidence'))
        process.kill.assert_called_once_with()
        self.assertEqual([call.kwargs['timeout'] for call in process.wait.call_args_list], [300, 300, 10])
        self.assertEqual(len(caught.exception.exceptions), 2)


    def test_late_completion_is_not_accepted(self) -> None:
        with self.assertRaisesRegex(RuntimeError, 'deadline reached without completion'):
            self.exercise(late=True, result={'status': 'PASSED', 'checks': dict.fromkeys(CHECKS, 'PASSED')})

    def test_signal_failure_does_not_skip_kill_or_reap(self) -> None:
        process = Mock(); process.poll.return_value = None; process.returncode = -9
        process.wait.side_effect = [runtime.subprocess.TimeoutExpired('fixture', 300),
                                   runtime.subprocess.TimeoutExpired('fixture', 300), -9]
        process.send_signal.side_effect = OSError('synthetic signal failure')
        with patch.object(Path, 'touch'), patch.object(Path, 'write_text'):
            with self.assertRaises(BaseExceptionGroup):
                runtime.stop_fixture(process, Path('/fixture'), Path('/control'), Path('/evidence'))
        process.kill.assert_called_once_with()
        self.assertEqual([call.kwargs['timeout'] for call in process.wait.call_args_list], [300, 300, 10])


if __name__ == '__main__':
    unittest.main()
