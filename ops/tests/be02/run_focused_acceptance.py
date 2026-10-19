"""Focused real-browser diagnostics with shared immutable images and fresh service stacks."""
from pathlib import Path
import json
import signal
import subprocess
import sys
import time
import uuid
root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'ops/tests/be02'))
import run
from docker_task import Task, RUBY, BUILDKIT
import re
from cleanup import cleanup
from acceptance_runtime import Acceptance, NODE, PLAYWRIGHT
import attachment_runtime
import acceptance_attachments as attachment_browser
attachment_browser.install()
project = 'be02-' + uuid.uuid4().hex
path = root / 'ops/local' / project
path.mkdir(mode=0o700)
owner = Task(root, path, project, 'default', {})
before = run.source_hashes(root, True)
owner.write('source.sha256.json', before)
web, browser = project + ':acceptance-web', project + ':acceptance-browser'
owner.owned_image_tags.update({web, browser})
acquired = []
results = []
original_invitation = Acceptance.invitation
original_init, original_docker, original_builder = Acceptance.__init__, Task.docker, Task.ensure_builder
def init(self, task, args):
    attachments = args.acceptance_case in {"SCN-QA-827-P", "SCN-QA-827-F1", "SCN-QA-827-F2", "SCN-QA-829-P", "SCN-QA-829-F1", "SCN-QA-830-P"}
    if attachments:
        attachment_runtime.configure(task)
    original_init(self, task, args)
    if attachments:
        attachment_browser.configure(self)
    task.owned_image_tags.difference_update({self.web, self.image})
    self.web, self.image = web, browser
    self.env.update(BE02_ACCEPTANCE_WEB_IMAGE=web, BE02_ACCEPTANCE_BROWSER_IMAGE=browser)
def invitation(self):
    original_invitation(self)
    if self.case_id == 'SCN-AUTH-006-P':
        return
    # AIDEV-NOTE: Required private invitation mount remains genuine, but its unrelated actor must not alter the roster.
    program = """require 'json'; require 'pg'
      data = JSON.parse(File.read('/acceptance/acceptance-invitation.json'))
      db = PG.connect(ENV.fetch('BE02_ADMIN_DATABASE_URL'))
      begin
        db.transaction do
          db.exec_params('SELECT app_auth.lock_authorization_generations($1,$2)', [data.fetch('organization_id'), data.fetch('actor_id')])
          result = db.exec_params('DELETE FROM app.organization_memberships WHERE organization_id=$1::uuid AND user_id=$2::uuid RETURNING user_id', [data.fetch('organization_id'), data.fetch('actor_id')])
          raise 'invitation isolation failed' unless result.ntuples == 1
        end
      ensure
        db.close
      end"""
    self.task.compose('isolate-unrelated-invitation', ['run', '--rm', '--no-deps', 'acceptance-invitation', 'bundle', 'exec', 'ruby', '-e', program], 60, quiet=True)
    if getattr(self.task, "attachment_browser_overlay", None) is not None:
        attachment_browser.produce(self)
def docker(self, name, args, *pos, **kw):
    if self is not owner and name == 'acceptance-build':
        return ''
    return original_docker(self, name, args, *pos, **kw)
def builder(self):
    if self is owner:
        return original_builder(self)
def interrupted(signum, frame):
    raise RuntimeError('interrupted signal ' + str(signum))
for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
    signal.signal(signum, interrupted)
try:
    # AIDEV-NOTE: Compose registration must validate before acquiring/building any images.
    import argparse
    probe_project = 'be02-' + uuid.uuid4().hex
    probe_path = root / 'ops/local' / probe_project
    probe_path.mkdir(mode=0o700)
    import secrets
    values = {key: secrets.token_hex(32) for key in ("POSTGRES_PASSWORD", "MIGRATOR_DB_PASSWORD", "API_DB_PASSWORD", "WORKER_DB_PASSWORD", "ATTACHMENT_GATEWAY_DB_PASSWORD", "SECRET_KEY_BASE", "BE02_FIXTURE_SIGNING_SECRET", "ELEVATEO_SESSION_KEY_BASE64")}
    probe = Task(root, probe_path, probe_project, 'default', values)
    env = {**values, "BE02_SOURCE": str(root), "BE02_PROJECT": probe_project, "BE02_SERVER_IMAGE": probe.image}
    probe.env_file.write_text("".join(f"{key}={value}\n" for key, value in env.items()))
    probe.env_file.chmod(0o600)
    try:
        parser = argparse.ArgumentParser()
        run.add_arguments(parser)
        args = parser.parse_args(['--acceptance', '--acceptance-diagnostic', '--acceptance-case', 'SCN-QA-829-P', '--acceptance-lanes', 'playwright', '--acceptance-browsers', 'chromium', '--acceptance-dispatch-id', 'focused-preflight'])
        attachment_runtime.configure(probe)
        check = Acceptance(probe, args)
        attachment_browser.configure(check)
        probe.compose('base-config-preflight', ['config', '--quiet'], quiet=True)
        probe.compose_files.append(root / 'ops/compose.acceptance-test.yaml')
        check.environment(0)
        probe.compose('attachment-config-preflight', ['config', '--quiet'], quiet=True)
        print('FOCUSED_PREFLIGHT passed', flush=True)
    finally:
        if not cleanup(probe):
            raise RuntimeError('preflight cleanup failed')
    pins = re.findall(r"image: (\S+@sha256:[a-f0-9]{64})", (root / "ops/compose.be02-test.yaml").read_text())
    for pin in dict.fromkeys((RUBY, BUILDKIT, NODE, PLAYWRIGHT, *pins, *attachment_runtime.PINS.values())):
        if subprocess.run(['docker', 'image', 'inspect', pin], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            acquired.append(pin)
            subprocess.run(['docker', 'pull', pin], check=True, timeout=600)
    owner.build()
    for tag, recipe in ((web, 'web'), (browser, 'browsers')):
        owner.docker('shared-acceptance-build', ['buildx', 'build', '--builder', owner.builder, '--load', '--platform', 'linux/amd64', '--label', 'elevateo.be02.project=' + project, '--tag', tag, '-f', str(root / ('ops/acceptance/' + recipe + '.Dockerfile')), str(root)], 900)
    image = owner.inspect('image', [owner.image])[0]['Id']
    Acceptance.__init__, Task.docker, Task.ensure_builder = init, docker, builder
    Acceptance.invitation = invitation
    cases = ('SCN-QA-830-P', 'SCN-QA-829-P', 'SCN-QA-829-F1', 'SCN-QA-827-P', 'SCN-QA-827-F1', 'SCN-QA-827-F2')
    for case in cases:
        existing = set((root / 'ops/local').glob('be02-*'))
        sys.argv = ['run.py', '--context', 'default', '--expect-host', 'Ubuntu-noble-latest-amd64-base', '--server-image', image, '--acceptance', '--acceptance-diagnostic', '--acceptance-case', case, '--acceptance-lanes', 'playwright', '--acceptance-browsers', 'chromium', '--acceptance-observer', '--acceptance-dispatch-id', 'completion1020-focused']
        result = run.main()
        evidence = sorted(str(item) for item in set((root / 'ops/local').glob('be02-*')) - existing)
        results.append({'case': case, 'exit': result, 'evidence': evidence})
        owner.write('focused-results.json', {'scope': 'Six isolated attachment Chromium cases; broader acceptance remains unverified', 'runs': results})
        print('FOCUSED_RESULT ' + json.dumps(results[-1]), flush=True)
finally:
    Acceptance.__init__, Task.docker, Task.ensure_builder = original_init, original_docker, original_builder
    Acceptance.invitation = original_invitation
    owner.deadline = time.monotonic() + 240
    clean = cleanup(owner)
    removal_failures = []
    for pin in reversed(acquired):
        try:
            result = subprocess.run(['docker', 'image', 'rm', pin], timeout=60, check=False)
            if result.returncode != 0:
                removal_failures.append(pin)
        except subprocess.TimeoutExpired:
            removal_failures.append(pin)
    clean = clean and not removal_failures
    unchanged = run.source_hashes(root, True) == before
    owner.write('focused-cleanup.json', {'cleanup_passed': clean, 'source_unchanged': unchanged, 'retained_images': removal_failures})
    print('FOCUSED_CLEANUP ' + json.dumps({'passed': clean, 'source_unchanged': unchanged}), flush=True)
raise SystemExit(0 if len(results) == len(cases) and all(item['exit'] == 0 for item in results) and clean and unchanged else 1)
