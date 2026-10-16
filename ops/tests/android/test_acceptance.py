"""Regression for relocated host orchestration without starting an emulator."""
import ast
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


class AcceptanceLocationTest(unittest.TestCase):
    def test_relocated_acceptance_uses_imported_request_helper(self) -> None:
        source = Path(__file__).with_name('acceptance.py')
        tree = ast.parse(source.read_text())
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'gui')
        runner = Mock(return_value=SimpleNamespace(stdout='true\n'))
        namespace = {'Path': Path, 'json': json, 'decode': json.loads,
                     'subprocess': SimpleNamespace(run=runner),
                     '__file__': '/relocated/diagnostic.py',
                     'qa_request': SimpleNamespace(__file__='/canonical/android/request.py')}
        # AIDEV-NOTE: Load only the helper; importing acceptance would mutate an actual running fixture.
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)
        self.assertTrue(namespace['gui']('snapshot'))
        self.assertEqual(runner.call_args.args[0], ['python3', '/canonical/android/request.py'])
        self.assertEqual(json.loads(runner.call_args.kwargs['input']), {'action': 'snapshot'})
        runner.side_effect = subprocess.CalledProcessError(1, ['python3'])
        with self.assertRaises(subprocess.CalledProcessError):
            namespace['gui']('snapshot')


if __name__ == '__main__':
    unittest.main()
