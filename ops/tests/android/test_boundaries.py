"""Boundary regressions for the private GUI supervisor; no Docker access needed."""
import unittest
from boundaries import CONTROL, ROOT, active_fixture, command, decode, private_password

class BoundaryTest(unittest.TestCase):
    def active(self) -> dict[str, str]:
        tag = 'android1036-runtime-' + 'a' * 12
        return {'status': 'READY', 'emulator': tag + '-emulator',
                'evidence': str(CONTROL / 'qa815-artifacts' / tag),
                'fixture_evidence': str(ROOT / 'ops/local' / ('be02-' + 'b' * 32))}

    def test_active_is_bound_to_owned_evidence(self) -> None:
        value = self.active()
        self.assertEqual(active_fixture(value)['emulator'], value['emulator'])
        for field, invalid in [('status', 'CLOSED'), ('emulator', '--privileged'),
                               ('evidence', '/tmp/other'), ('fixture_evidence', '/tmp/private')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                active_fixture({**value, field: invalid})

    def test_commands_allow_exact_supported_shapes(self) -> None:
        for value in [{'action': 'private-login'}, {'action': 'snapshot'},
                      {'action': 'fill', 'selector': 'textarea', 'value': ''},
                      {'action': 'screen', 'name': '01-login'},
                      {'action': 'evaluate', 'expression': 'innerHeight'},
                      {'action': 'click', 'selector': 'button'}]:
            with self.subTest(value=value):
                self.assertEqual(command(value), value)

    def test_null_missing_unknown_and_oversized_commands_fail(self) -> None:
        for value in [None, [], {}, {'action': 'execute'}, {'action': 'snapshot', 'value': 'x'},
                      {'action': 'fill', 'selector': 'input'}, {'action': 'click', 'selector': None},
                      {'action': 'click', 'selector': ''}, {'action': 'screen', 'name': '../x'},
                      {'action': 'evaluate', 'expression': 'x' * 16385}]:
            with self.subTest(value=str(value)[:80]), self.assertRaises(ValueError):
                command(value)
        self.assertEqual(decode('null'), None)
        with self.assertRaises(ValueError):
            decode(' ' * 65537)
        with self.assertRaises(ValueError):
            decode('{')

    def test_private_password_validates_schema_and_format(self) -> None:
        password = 'Be02!' + 'a' * 48
        self.assertEqual(private_password({'schema_version': 1, 'passwords': {'manager_primary': password}}), password)
        for value in [None, {}, {'schema_version': True, 'passwords': {'manager_primary': password}},
                      {'schema_version': 1, 'passwords': []},
                      {'schema_version': 1, 'passwords': {'manager_primary': 1}},
                      {'schema_version': 1, 'passwords': {'manager_primary': 'real-secret'}}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                private_password(value)

if __name__ == '__main__':
    unittest.main()
