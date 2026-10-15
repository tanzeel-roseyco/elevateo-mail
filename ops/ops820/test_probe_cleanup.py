"""No real Docker: cleanup owns exact IDs and reports uncertain disposal."""
import os
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ("health-probe.sh", "worker-probe.sh")


class ProbeCleanupTest(unittest.TestCase):
    def test_collision_create_cleanup_and_daemon_failure(self) -> None:
        for script in SCRIPTS:
            for mode in ("collision", "run-failure", "success", "lowercase", "already-removed",
                         "daemon-failure", "remove-denied", "different-id", "still-present"):
                with self.subTest(script=script, mode=mode), tempfile.TemporaryDirectory() as directory:
                    folder = pathlib.Path(directory)
                    fake = folder / "docker"
                    log = folder / "calls.txt"
                    envfile = folder / "private.env"
                    envfile.write_text("")
                    fake.write_text("""#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$OPS820_FAKE_LOG"
case "$1" in
inspect)
  if [[ "$2" == --format ]]; then
    printf '%s|%s|%s|%s/apps/server:/workspace/apps/server:false;\\n' \\
      "$OPS820_FAKE_ID" "$OPS820_FAKE_PROJECT" "$OPS820_FAKE_KIND" "$OPS820_FAKE_ROOT"
    exit 0
  fi
  if [[ "$2" == "$OPS820_FAKE_ID" ]]; then
    case "$OPS820_FAKE_MODE" in
      daemon-failure) echo 'permission denied' >&2 ;;
      lowercase|already-removed) echo "error: no such object: $OPS820_FAKE_ID" >&2 ;;
      different-id) echo "error: no such object: aaaaaaaaaaaa" >&2 ;;
      still-present) echo '{}'; exit 0 ;;
      *) echo "No such object: $OPS820_FAKE_ID" >&2 ;;
    esac
    exit 1
  fi
  [[ "$OPS820_FAKE_MODE" == collision ]] && exit 0
  exit 1 ;;
run)
  [[ "$OPS820_FAKE_MODE" == run-failure ]] && exit 125
  for arg in "$@"; do [[ "$arg" == -d ]] && { echo "$OPS820_FAKE_ID"; exit 0; }; done
  exit 0 ;;
rm)
  case "$OPS820_FAKE_MODE" in
    daemon-failure|remove-denied) echo 'permission denied' >&2; exit 1 ;;
    already-removed) echo "error: no such container: $OPS820_FAKE_ID" >&2; exit 1 ;;
  esac
  echo "$OPS820_FAKE_ID"; exit 0 ;;
exec) exit 0 ;;
esac
exit 99
""")
                    fake.chmod(0o700)
                    env = os.environ.copy()
                    env.update(PATH=f"{folder}:{env['PATH']}", OPS820_FAKE_LOG=str(log),
                               OPS820_FAKE_MODE=mode, OPS820_SERVER_IMAGE="sha256:" + "a" * 64,
                               OPS820_FAKE_ID="b" * 64, OPS820_FAKE_PROJECT="ops402-restore-fake",
                               OPS820_FAKE_KIND="api" if script == "health-probe.sh" else "worker",
                               OPS820_FAKE_ROOT=str(ROOT))
                    result = subprocess.run(
                        ["bash", str(ROOT / "ops/ops820" / script), "ops402-restore-fake",
                         str(envfile), str(ROOT)], env=env, capture_output=True, text=True,
                        check=False, timeout=10)
                    successful = mode in ("success", "lowercase", "already-removed")
                    self.assertEqual(result.returncode == 0, successful, result.stderr)
                    calls = log.read_text().splitlines()
                    created = mode not in ("collision", "run-failure")
                    self.assertEqual(any(call.startswith("rm ") for call in calls),
                                     created, calls)
                    if created:
                        self.assertEqual([call for call in calls if call.startswith("rm ")],
                                         ["rm -f " + "b" * 64])
                    self.assertEqual(any(call.startswith("run ") for call in calls), mode != "collision")
                    if created:
                        self.assertIn(f"cleanup_exit={0 if successful else 1}", result.stdout)


if __name__ == "__main__":
    unittest.main()
