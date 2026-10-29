"""Failure injection for independent fixture finalization; run only in fleet Docker."""
import unittest

from fixture_finally import finish_fixture


class FixtureFinallyTest(unittest.TestCase):
    def test_interrupt_survives_unlink_failure_and_teardown_runs(self):
        interrupt = KeyboardInterrupt('protocol interrupted')
        calls = []
        records = []

        def unlink():
            raise OSError('credential unlink denied')

        with self.assertRaises(KeyboardInterrupt) as caught:
            finish_fixture(interrupt, [('credentials', unlink),
                ('fixture', lambda: calls.append('removed'))], records.append)
        self.assertIs(interrupt, caught.exception)
        self.assertEqual(['removed'], calls)
        self.assertIn('credential unlink denied', records[0][0])

    def test_retained_resources_reported_without_masking_primary(self):
        primary = RuntimeError('protocol failed')
        records = []
        with self.assertRaises(RuntimeError) as caught:
            finish_fixture(primary, [('fixture', lambda: ['retained exact fixture'])], records.append)
        self.assertIs(primary, caught.exception)
        self.assertEqual([['retained exact fixture']], records)

    def test_cleanup_failure_fails_success(self):
        with self.assertRaisesRegex(RuntimeError, 'retained exact fixture'):
            finish_fixture(None, [('fixture', lambda: ['retained exact fixture'])], lambda _: None)


if __name__ == '__main__':
    unittest.main()
