"""Run only in Soren's disposable Python gate; no Docker or Auth mocks claim expiry behavior."""
from copy import deepcopy
import unittest
from typing import Any
from unittest.mock import Mock, patch
from adv815_runtime import AUTH_PIN, expiry_receipt, run_expiry


def inspection() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    image = {"Id": "sha256:owned", "Config": {"Entrypoint": ["auth"], "Cmd": []}}
    container = {"Config": {"Image": AUTH_PIN, "Entrypoint": ["auth"], "Cmd": [],
        "Labels": {"com.docker.compose.project": "be02-test", "com.docker.compose.service": "auth"},
        "Env": ["GOTRUE_JWT_EXP=3600", "GOTRUE_SESSIONS_TIMEBOX=12h",
                "GOTRUE_SESSIONS_SINGLE_PER_USER=false", "GOTRUE_SMTP_HOST=mailpit",
                "GOTRUE_SMTP_PORT=1025", "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:secret@db:5432/postgres"]},
        "Image": "sha256:owned", "State": {"Running": True}, "Mounts": [],
        "HostConfig": {"PortBindings": {}}, "NetworkSettings": {"Networks": {"isolated": {"NetworkID": "net"}}}}
    network = {"Id": "net", "Internal": True, "Labels": {"com.docker.compose.project": "be02-test"}}
    return container, image, network


class ExpiryIntegrationTest(unittest.TestCase):
    def test_effective_ttl_and_topology_rejections(self) -> None:
        container, image, network = inspection()
        receipt = expiry_receipt(container, image, network, "be02-test", "secret", "a" * 32)
        self.assertEqual((receipt["otp_seconds"], receipt["ttl_source"]), (86400, "pinned_default"))
        container["Config"]["Env"].append("GOTRUE_MAILER_OTP_EXP=120")
        self.assertEqual(expiry_receipt(container, image, network, "be02-test", "secret", "a" * 32)["otp_seconds"], 120)
        for mutate in (lambda c, n: n.update(Internal=False),
                       lambda c, n: n.update(Id="foreign"),
                       lambda c, n: c["HostConfig"].update(PortBindings={"9999/tcp": [{}]}),
                       lambda c, n: c["Config"]["Env"].append("GOTRUE_MAILER_OTP_EXP=0")):
            altered, changed = deepcopy(container), deepcopy(network)
            mutate(altered, changed)
            with self.assertRaises(RuntimeError):
                expiry_receipt(altered, image, changed, "be02-test", "secret", "a" * 32)

    def test_strict_failure_prevents_probe_and_keeps_cleanup_with_caller(self) -> None:
        container, image, network = inspection()
        task = Mock(project="be02-test", secrets={"POSTGRES_PASSWORD": "secret"})
        db = deepcopy(container)
        smtp = deepcopy(container)
        db["Config"]["Labels"]["com.docker.compose.service"] = "db"
        smtp["Config"]["Labels"]["com.docker.compose.service"] = "mailpit"
        db["Config"]["Image"] = "supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00"
        smtp["Config"]["Image"] = "axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea"
        db["NetworkSettings"]["Networks"]["isolated"]["Aliases"] = ["db"]
        smtp["NetworkSettings"]["Networks"]["isolated"]["Aliases"] = ["mailpit"]
        task.project_containers.return_value = [container, db, smtp]
        task.inspect.side_effect = [[image], [network], [image], [image]]
        task.compose.side_effect = RuntimeError("typing failed")
        with self.assertRaises(RuntimeError):
            run_expiry(task)
        self.assertEqual(task.compose.call_count, 1)
        self.assertEqual(task.compose.call_args.args[0], "adv815-strict")
        task.cleanup.assert_not_called()

    def test_probe_receives_only_authority_env_and_outer_deadline(self) -> None:
        container, image, network = inspection()
        task = Mock(project="be02-test", secrets={"POSTGRES_PASSWORD": "secret"})
        db = deepcopy(container)
        smtp = deepcopy(container)
        db["Config"]["Labels"]["com.docker.compose.service"] = "db"
        smtp["Config"]["Labels"]["com.docker.compose.service"] = "mailpit"
        db["Config"]["Image"] = "supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00"
        smtp["Config"]["Image"] = "axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea"
        db["NetworkSettings"]["Networks"]["isolated"]["Aliases"] = ["db"]
        smtp["NetworkSettings"]["Networks"]["isolated"]["Aliases"] = ["mailpit"]
        task.project_containers.return_value = [container, db, smtp]
        task.inspect.side_effect = [[image], [network], [image], [image]]
        with patch("adv815_runtime.secrets.token_hex", return_value="a" * 32):
            run_expiry(task)
        name, args, timeout = task.compose.call_args.args
        self.assertEqual((name, timeout), ("adv815-expiry", 240))
        keys = [args[index + 1].split("=", 1)[0] for index, value in enumerate(args) if value == "-e"]
        self.assertEqual(keys, ["ADV815_AUTH_RECEIPT", "ADV815_PROJECT", "ADV815_NONCE"])
        self.assertEqual(args[-6:], ["bundle", "exec", "ruby", "-r",
            "/workspace/ops/tests/be02/adv815_json_boundary_test.rb", "/workspace/ops/tests/be02/adv815_expiry_test.rb"])


if __name__ == "__main__":
    unittest.main()
