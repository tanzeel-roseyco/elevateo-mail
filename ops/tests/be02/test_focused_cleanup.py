"""Inject image-removal failure into the actual runner finalization AST."""
import ast
from pathlib import Path
from types import SimpleNamespace
import subprocess
import unittest
from unittest.mock import Mock

class CleanupTests(unittest.TestCase):
    def test_failed_removal_continues_and_records_failed_receipt(self):
        source = (Path(__file__).with_name('run_focused_acceptance.py')).read_text()
        tree = ast.parse(source)
        final = next(node.finalbody for node in tree.body if isinstance(node, ast.Try))
        start = next(i for i, node in enumerate(final) if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'removal_failures' for t in node.targets))
        block = ast.Module(body=final[start:], type_ignores=[])
        process = Mock(side_effect=[SimpleNamespace(returncode=1), subprocess.TimeoutExpired('docker', 60), SimpleNamespace(returncode=0)])
        owner = SimpleNamespace(write=Mock())
        hashes = Mock(return_value={'source': 'stable'})
        env = {'subprocess': SimpleNamespace(run=process, TimeoutExpired=subprocess.TimeoutExpired),
            'acquired': ['first', 'second', 'third'], 'clean': True, 'owner': owner,
            'run': SimpleNamespace(source_hashes=hashes), 'root': Path('/source'),
            'before': {'source': 'stable'}, 'json': __import__('json')}
        exec(compile(block, '<actual-runner-cleanup>', 'exec'), env)
        self.assertEqual(process.call_count, 3)
        self.assertFalse(env['clean'])
        hashes.assert_called_once()
        owner.write.assert_called_once_with('focused-cleanup.json', {
            'cleanup_passed': False, 'source_unchanged': True, 'retained_images': ['third', 'second']})

if __name__ == '__main__':
    unittest.main()
