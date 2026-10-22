"""CSV identity mapping regression: explicit domains only, no partial output."""
from __future__ import annotations

import csv
import json
from pathlib import Path
import tempfile
import unittest

from import_plan import bind
from test_deployment import fixture


class ImportTest(unittest.TestCase):
    def test_mapping_and_failures(self) -> None:
        # AIDEV-NOTE: Synthetic rows exercise the same schema without copying personal data into source.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            plan = fixture()
            accounts = plan.pop('accounts')
            settings = root / 'settings.json'
            source = root / 'plan.csv'
            with source.open('w', newline='') as output:
                writer = csv.DictWriter(output, fieldnames=['LocalPart', 'Domain', 'Status'])
                writer.writeheader()
                for account in accounts:
                    writer.writerow(dict(LocalPart=account.split('@')[0], Domain='UNASSIGNED',
                                         Status='PLANNED_NOT_PROVISIONED'))
            plan['assignments'] = {account.split('@')[0]: account.split('@')[1] for account in accounts}
            settings.write_text(json.dumps(plan))
            bind(source, settings, root / 'manifest.json')
            self.assertEqual(json.loads((root / 'manifest.json').read_text())['accounts'], accounts)
            for assignments in [{}, {**plan['assignments'], 'person000': 'unapproved.com'}]:
                settings.write_text(json.dumps({**plan, 'assignments': assignments}))
                with self.assertRaises(ValueError):
                    bind(source, settings, root / 'rejected.json')
                self.assertFalse((root / 'rejected.json').exists())


if __name__ == '__main__':
    unittest.main()
