"""Fingerprint normalization must retain substantive constraint changes."""
from __future__ import annotations
import unittest
from normalize_schema_dump import normalize_dump

PREFIX = '    CONSTRAINT attachment_stage_operations_filename_check CHECK ('
FLAT = PREFIX + "((octet_length(filename) >= 1) AND (octet_length(filename) <= 255) AND (filename = btrim(filename)))),\n"
GROUPED = PREFIX + "(((octet_length(filename) >= 1) AND (octet_length(filename) <= 255)) AND (filename = btrim(filename)))),\n"


class SchemaDumpTest(unittest.TestCase):
    def test_equivalent_restored_group_matches(self) -> None:
        self.assertEqual(normalize_dump(GROUPED), FLAT)
        self.assertEqual(normalize_dump(FLAT), FLAT)

    def test_changed_bounds_remain_different(self) -> None:
        for bound in ('>= 0', '> 1', '<= 256', '< 255'):
            source = '>= 1' if bound.startswith('>') else '<= 255'
            changed = GROUPED.replace(source, bound)
            self.assertNotEqual(normalize_dump(changed), normalize_dump(FLAT))

    def test_other_constraints_and_content_are_preserved(self) -> None:
        other = GROUPED.replace('attachment_stage_operations_filename_check', 'other_filename_check')
        self.assertEqual(normalize_dump(other), other)
        self.assertNotEqual(normalize_dump(GROUPED.replace('btrim(filename)', 'filename')), FLAT)
        self.assertEqual(normalize_dump(''), '')


if __name__ == '__main__':
    unittest.main()
