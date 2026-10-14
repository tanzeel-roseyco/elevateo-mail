"""Socket-free policy regressions; run only inside the coordinator's Docker allocation."""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from typing import Any
import unittest

from acceptance_cleanup import validate_policy
from docker_task import Task


class PolicyTests(unittest.TestCase):
    # AIDEV-NOTE: Synthetic HostConfig mutations test rejection; root separately proves real engine representation.
    def setUp(self) -> None:
        self.task = Task(Path("/source"), Path("/evidence"), "policy-test", "default", {})
        setattr(self.task, "acceptance_uid", 1001)
        setattr(self.task, "acceptance_gid", 1001)
        self.policy = {"defaultAction": "SCMP_ACT_ERRNO", "syscalls": [
            {"names": ["clone", "setns", "unshare"], "action": "SCMP_ACT_ALLOW"}]}
        setattr(self.task, "acceptance_seccomp", deepcopy(self.policy))
        # AIDEV-NOTE: Any is limited to Docker's heterogeneous inspect fixture, deliberately mutated below.
        self.host: dict[str, Any] = {"Memory": 3 * 1024**3, "NanoCpus": 2_000_000_000,
            "PidsLimit": 512, "ShmSize": 1024**3,
            "Tmpfs": {"/tmp": "rw,nosuid,nodev,size=512m,mode=1777"},
            "SecurityOpt": ["no-new-privileges:true", "seccomp=" + json.dumps(self.policy)]}

    def test_valid_policy_uses_json_semantics(self) -> None:
        self.host["SecurityOpt"][1] = "seccomp=" + json.dumps(self.policy, sort_keys=True, indent=2)
        for service in ("acceptance-browser", "selenium"):
            validate_policy(self.task, service, self.host)

    def test_disabled_missing_conflicting_or_permissive_security(self) -> None:
        seccomp = self.host["SecurityOpt"][1]
        for options in (None, [], [seccomp], ["no-new-privileges:false", seccomp],
                        ["no-new-privileges", seccomp], ["no-new-privileges:garbage", seccomp],
                        ["no-new-privileges:true", "no-new-privileges:false", seccomp],
                        ["no-new-privileges:true"], ["no-new-privileges:true", "seccomp=unconfined"],
                        ["no-new-privileges:true", 'seccomp={"defaultAction":"SCMP_ACT_ALLOW"}']):
            with self.subTest(options=options), self.assertRaises((RuntimeError, ValueError)):
                validate_policy(self.task, "acceptance-browser", {**self.host, "SecurityOpt": options})
        setattr(self.task, "acceptance_seccomp", None)
        with self.assertRaises(RuntimeError):
            validate_policy(self.task, "acceptance-browser", self.host)

    def test_changed_browser_limits_and_tmpfs(self) -> None:
        for field, values in {"PidsLimit": [None, -1, 0, 511, 513, True], "Memory": [0, 3 * 1024**3 + 1],
                              "NanoCpus": [0, 1_000_000_000, 2_000_000_001], "ShmSize": [0, 2 * 1024**3],
                              "Tmpfs": [{}, {"/tmp": "rw,nosuid,nodev,size=1g,mode=1777"},
                                        {"/tmp": "rw,size=512m,mode=1777"}]}.items():
            for value in values:
                with self.subTest(field=field, value=value), self.assertRaises(RuntimeError):
                    validate_policy(self.task, "acceptance-browser", {**self.host, field: value})

    def test_web_and_seed_service_specific_policy(self) -> None:
        web = {**self.host, "Memory": 128 * 1024**2, "NanoCpus": 1_000_000_000,
               "PidsLimit": 64, "Tmpfs": {}, "SecurityOpt": ["no-new-privileges:true"]}
        seed = {**web, "Memory": 768 * 1024**2, "PidsLimit": 256,
                "Tmpfs": {**self.host["Tmpfs"], "/workspace/apps/server/tmp": "uid=1001,gid=1001,mode=1770",
                          "/workspace/apps/server/log": "uid=1001,gid=1001,mode=1770"}}
        for service, host in (("acceptance-web", web), ("acceptance-seed", seed), ("acceptance-invitation", seed)):
            validate_policy(self.task, service, host)
            for field in ("Memory", "NanoCpus", "PidsLimit"):
                with self.subTest(service=service, field=field), self.assertRaises(RuntimeError):
                    validate_policy(self.task, service, {**host, field: host[field] + 1})
        with self.assertRaises(RuntimeError):
            validate_policy(self.task, "acceptance-seed", {**seed, "Tmpfs": self.host["Tmpfs"]})


if __name__ == "__main__":
    unittest.main()
