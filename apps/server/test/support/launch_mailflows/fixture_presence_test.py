"""Docker-mocked ownership and already-absent fixture cleanup regressions."""
import unittest
import time
from unittest.mock import MagicMock, patch

import fleet_protocol as fleet


class FixturePresenceTest(unittest.TestCase):
    def fixture(self, present):
        task = MagicMock()
        task.docker.side_effect = lambda label, *args, **kwargs: 'owned-id' if label == 'fixture-presence' and present else ''
        task.inspect.return_value = [{'Name': '/' + fleet.PROJECT + '-mox',
            'Config': {'Image': fleet.FIXTURE_IMAGE, 'Labels': {'com.docker.compose.project': fleet.PROJECT}},
            'HostConfig': {'PortBindings': {}}, 'Mounts': []}]
        return task

    def test_absent_fixture_skips_inspect_and_cleans_private(self):
        task = self.fixture(False)
        with patch.object(fleet.shutil, 'rmtree') as remove:
            self.assertEqual([], fleet.clean_fixture(task, fleet.PROJECT + '-mox'))
        task.inspect.assert_not_called()
        remove.assert_called_once_with(fleet.PRIVATE)

    def test_present_fixture_is_inspected_before_removal(self):
        task = self.fixture(True)
        with patch.object(fleet.shutil, 'rmtree'):
            self.assertEqual([], fleet.clean_fixture(task, fleet.PROJECT + '-mox'))
        task.inspect.assert_called_once_with('container', [fleet.PROJECT + '-mox'])
        self.assertIn('mox-remove', [call.args[0] for call in task.docker.call_args_list])

    def test_wrong_owner_is_retained_and_reported(self):
        task = self.fixture(True)
        task.inspect.return_value[0]['Config']['Labels'] = {}
        with patch.object(fleet.shutil, 'rmtree') as remove:
            self.assertEqual(['retained fixture: exact ownership inspection failed'],
                fleet.clean_fixture(task, fleet.PROJECT + '-mox'))
        remove.assert_not_called()
        self.assertNotIn('mox-remove', [call.args[0] for call in task.docker.call_args_list])

    def test_failed_remove_retains_private_and_reports_absence_failure(self):
        task = self.fixture(True)
        task.docker.side_effect = lambda label, *args, **kwargs: 'owned-id' if label in ('fixture-presence', 'fixture-absence') else ''
        with patch.object(fleet.shutil, 'rmtree') as remove:
            errors = fleet.clean_fixture(task, fleet.PROJECT + '-mox')
        self.assertIn('removal did not establish absence', errors[0])
        remove.assert_not_called()

    def test_expired_budget_is_reset_before_presence_query(self):
        task = self.fixture(False)
        task.deadline = 0

        def docker(*args, **kwargs):
            self.assertGreater(task.deadline, time.monotonic())
            self.assertTrue(task.cleanup_mode)
            return ''

        task.docker.side_effect = docker
        with patch.object(fleet.shutil, 'rmtree'):
            self.assertEqual([], fleet.clean_fixture(task, fleet.PROJECT + '-mox'))


if __name__ == '__main__':
    unittest.main()
