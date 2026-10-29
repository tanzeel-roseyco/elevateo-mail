"""Task-owned, network-isolated Mox protocol and application source checks."""
from __future__ import annotations

import base64
import fcntl
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import sys
import time

ROOT = Path('/tmp/launch-http-approval-mailflow-20261023/source')
sys.path.insert(0, str(ROOT / 'ops/tests/be02'))
from docker_task import Task, RUBY
from run import bootstrap_database_roles, finalize, source_hashes
from fixture_finally import finish_fixture

FIXTURE_IMAGE = 'mcr.microsoft.com/playwright@sha256:35246d87a7c88ea9b771c65d33171b2611b02a8253b4b12ce6f94376c55f99f2'
PROJECT = 'launch-http-approval-mailflow-20261023-e'
PRIVATE = Path('/tmp/launch-http-approval-mailflow-20261023/protocol-e')


def configure_http_approval(task: Task, epoch: str) -> None:
    # AIDEV-NOTE: Production guards stay intact; only synthetic private API uses this held Mox configuration.
    control = task.evidence / 'http-control.json'
    control.write_text(json.dumps({'epoch': epoch, 'outbound_held': True}))
    control.chmod(0o644)
    overlay = task.evidence / 'http-approval.compose.json'
    overlay.write_text(json.dumps({'services': {'api': {'environment': {
        'RAILS_ENV': 'production', 'ELEVATEO_MODE': 'production',
        'ELEVATEO_OUTBOUND_MODE': 'mox', 'ELEVATEO_OUTBOUND_HOLD': 'true',
        'ELEVATEO_MOX_PRODUCTION_ENABLED': 'false', 'ELEVATEO_LOCAL_HTTP': None,
        'ELEVATEO_COOKIE_SECURE': 'true', 'ELEVATEO_BROWSER_ORIGIN': 'https://mail.elevateoco.com',
        'ELEVATEO_SEND_API_ENABLED': 'true', 'ELEVATEO_SEND_CONTROL_PATH': '/tmp/mailflow-control.json'}}}}))
    task.compose_files.append(overlay)


def check_sources(task: Task) -> list[str]:
    base = ['run', '--rm', '--network', 'none', '--read-only', '--memory', '1g', '--cpus', '2',
            '--tmpfs', '/tmp:rw,nosuid,size=256m', '--env', 'HOME=/tmp', '--env', 'RUBOCOP_CACHE_ROOT=/tmp/rubocop',
            '--label', 'com.docker.compose.project=' + PROJECT, task.image, 'bundle', 'exec']
    tests = ['./test/be_02/auth_config_test.rb', './test/be_02/google_sso_test.rb',
             './test/send_worker/smtp_snapshot_test.rb', './test/send_worker/mail_message_identity_test.rb',
             './test/inbound/imap_ingress_test.rb', './test/sends/send_api_reads_test.rb',
             './test/inbound/tls_imap_transport_test.rb', './test/inbound/imap_deadline_test.rb',
             './test/support/launch_mailflows/cleanup_test.rb']
    checks = [('targeted-units', ['ruby', '-Itest', '-e',
                'ARGV.each { |path| require_relative path }', *tests], 120),
              ('strict-types', ['steep', 'check', '--jobs=2'], 240),
              ('targeted-lint', ['rubocop', '--lint', 'lib/elevateo/config.rb',
                'lib/elevateo/google_sso.rb', 'lib/elevateo/session_store.rb',
                'test/be_02/auth_config_test.rb', 'test/be_02/google_sso_test.rb',
                'lib/elevateo/mail_message_identity.rb', 'lib/elevateo/send_worker/smtp_snapshot.rb',
                'test/send_worker/smtp_snapshot_test.rb', 'test/send_worker/mail_message_identity_test.rb',
                'lib/elevateo/inbound/imap_ingress.rb', 'lib/elevateo/inbound/imap_worker_store.rb',
                'lib/elevateo/send_api/canonical.rb', 'lib/elevateo/send_api/review.rb',
                'lib/elevateo/inbound/tls_imap_transport.rb', 'test/inbound/tls_imap_transport_test.rb',
                'test/inbound/imap_deadline_test.rb',
                'test/inbound/imap_ingress_test.rb', 'test/sends/send_api_reads_test.rb',
                'test/inbound/mail_identity_database_test.rb',
                'test/support/launch_mailflows/http_chain.rb',
                'test/support/launch_mailflows/http_approval.rb',
                'test/support/launch_mailflows/app_chain_test.rb',
                'db/migrate/20261023000043_preserve_mail_reply_identity.rb'], 120)]
    failures: list[str] = []
    # AIDEV-NOTE: Independent gates all run; a baseline type failure must not erase database regression evidence.
    for label, arguments, timeout in checks:
        try:
            task.docker(label, base + arguments, timeout)
        except Exception as error:
            failures.append(label + ': ' + str(error))
    task.write('source-check-failures.json', failures)
    return failures


def clean_fixture(task: Task, name: str) -> list[str]:
    # AIDEV-NOTE: Cleanup errors are recorded separately so they cannot erase the first protocol failure.
    failures: list[str] = []
    task.cleanup_mode = True
    task.deadline = time.monotonic() + 240
    present = task.docker('fixture-presence', ['container', 'ls', '-aq', '--filter', 'name=^/' + name + '$']).strip()
    containers = task.inspect('container', [name]) if present else []
    if containers:
        container = containers[0]
        mounts = container.get('Mounts', [])
        allowed = {str(PRIVATE), str(ROOT),
            '/home/tanzeel/elevateo-mail-completion-20261015/control/mail1017/release/mox',
            str(ROOT / 'apps/server/test/support/launch_mailflows/protocol.py'), str(PRIVATE / 'resolv.conf')}
        if (container.get('Name') != '/' + name or
                container['Config'].get('Image') != FIXTURE_IMAGE or
                container['Config'].get('Labels', {}).get('com.docker.compose.project') != PROJECT or
                container['HostConfig'].get('PortBindings') or
                any(mount['Source'] not in allowed for mount in mounts if mount['Type'] == 'bind')):
            return ['retained fixture: exact ownership inspection failed']
    commands = [('mox-logs', ['logs', name]),
                ('mox-server-log', ['exec', name, 'cat', '/private/runtime/server.log']),
                ('mox-done', ['exec', name, 'touch', '/private/runtime/done']),
                ('mox-stop', ['stop', '--time', '25', name]), ('mox-remove', ['rm', name])]
    for label, arguments in commands if containers else []:
        try:
            task.docker(label, arguments, 35, required=False)
        except Exception as error:
            failures.append(label + ': ' + str(error))
    remaining = task.docker('fixture-absence', ['container', 'ls', '-aq', '--filter', 'name=^/' + name + '$']).strip()
    if remaining:
        return failures + ['retained fixture: removal did not establish absence; private data retained']
    if PRIVATE.resolve() != Path('/tmp/launch-http-approval-mailflow-20261023/protocol-e'):
        return failures + ['private cleanup target mismatch']
    try:
        # AIDEV-NOTE: This cleanup container mounts only its synthetic directory; no source or persistent data.
        script = "import os,shutil; p='/private/runtime'; shutil.rmtree(p) if os.path.isdir(p) else None; "
        script += f"os.chown('/private',{os.getuid()},{os.getgid()}); os.chmod('/private',0o700)"
        task.docker('private-fixture-cleanup', ['run', '--rm', '--network', 'none', '--read-only',
                    '--user', '0', '--label', 'com.docker.compose.project=' + PROJECT,
                    '--mount', 'type=bind,src=' + str(PRIVATE) + ',dst=/private', FIXTURE_IMAGE,
                    'python3', '-c', script], 30)
        shutil.rmtree(PRIVATE)
    except Exception as error:
        failures.append('private cleanup: ' + str(error))
    return failures


def protocol(task: Task, values: dict[str, str]) -> None:
    name = PROJECT + '-mox'
    primary: BaseException | None = None
    acquired = False
    try:
        PRIVATE.mkdir(mode=0o700)
        acquired = True
        resolver = PRIVATE / 'resolv.conf'
        resolver.write_text('nameserver 127.0.0.1\n')
        resolver.chmod(0o644)
        helper = ROOT / 'apps/server/test/support/launch_mailflows/protocol.py'
        helper.chmod(0o644)
        mounts = [(PRIVATE, '/private'), (ROOT, '/source,readonly'),
                  (Path('/home/tanzeel/elevateo-mail-completion-20261015/control/mail1017/release/mox'), '/release/mox,readonly'),
                  (helper, '/protocol.py,readonly'), (resolver, '/etc/resolv.conf,readonly')]
        # AIDEV-NOTE: Docker forbids attaching an internal network after starting in its private none mode.
        if task.docker('internal-network-proof', ['network', 'inspect', '--format', '{{.Internal}}',
                       PROJECT + '_isolated']).strip() != 'true':
            raise RuntimeError('app-chain network is not internal')
        args = ['run', '-d', '--name', name, '--network', PROJECT + '_isolated', '--read-only', '--memory', '2g',
                '--cpus', '2', '--pids-limit', '128', '--label', 'com.docker.compose.project=' + PROJECT,
                '--tmpfs', '/tmp:rw,nosuid,size=512m']
        for source, target in mounts:
            args.extend(['--mount', 'type=bind,src=' + str(source) + ',dst=' + target])
        task.docker('mox-start', args + ['--add-host', 'mail.dispatch.company.com:127.0.0.1',
                    '--add-host', 'mail.second.company.com:127.0.0.1', FIXTURE_IMAGE, 'python3', '/protocol.py'], 30)
        until = time.monotonic() + 65
        while True:
            ready = task.docker('mox-readiness', ['exec', name, 'python3', '-c',
                                "from pathlib import Path; print(Path('/private/runtime/ready').is_file())"], 10, required=False).strip()
            if ready == 'True':
                break
            running = task.docker('mox-running', ['inspect', '--format', '{{.State.Running}}', name], 10).strip()
            if running != 'true' or time.monotonic() > until:
                raise RuntimeError('Mox readiness failed; inspect fixture logs')
            time.sleep(0.3)
        task.docker('ruby-mox-protocol', ['run', '--rm', '--network', 'container:' + name,
                    # AIDEV-NOTE: Mail parsing needs a disposable temporary directory under the read-only container root.
                    '--tmpfs', '/tmp:rw,nosuid,size=64m,mode=1777',
                    '--read-only', '--memory', '768m', '--cpus', '2', '--label',
                    'com.docker.compose.project=' + PROJECT, '--mount', 'type=bind,src=' + str(PRIVATE / 'runtime') + ',dst=/fixture,readonly',
                    '--env', 'SSL_CERT_FILE=/fixture/ca.pem', '--env', 'BE02_MOX_PRODUCTION_PROTOCOL=1',
                    '--env', 'BE02_MOX_PROTOCOL_DIRECTORY=/fixture', task.image, 'bundle', 'exec', 'ruby',
                    'test/send_worker/production_mox_protocol_test.rb'], 100)
        # AIDEV-NOTE: Mox DNS remains loopback-only; only the verified task-internal network is reachable.
        db = task.compose('database-id', ['ps', '-q', 'db'], 15).strip()
        address = task.docker('database-address', ['inspect', '--format',
            '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', db], 15).strip()
        import ipaddress
        ipaddress.IPv4Address(address)
        # AIDEV-NOTE: Fixed task-only hosts allow HTTP without granting the Mox namespace an external DNS resolver.
        hosts = ['127.0.0.1 localhost mail.dispatch.company.com mail.second.company.com']
        for service in ('api', 'auth', 'mailpit'):
            container = task.compose(service + '-id', ['ps', '-q', service], 15).strip()
            host = task.docker(service + '-address', ['inspect', '--format',
                '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', container], 15).strip()
            ipaddress.IPv4Address(host)
            hosts.append(host + ' ' + service)
        # AIDEV-NOTE: Mox takes ownership of PRIVATE; runner-owned files stay outside that root-owned mount.
        hosts_file = task.evidence / 'hosts'
        hosts_file.write_text('\n'.join(hosts) + '\n')
        hosts_file.chmod(0o644)
        chain_env = {'BE02_MOX_APP_CHAIN': '1', 'BE02_TASK_DATABASE_NAME': 'postgres',
                     'BE02_MOX_CONTROL_EPOCH': values['MAILFLOW_CONTROL_EPOCH'],
                     'BE02_MOX_PROTOCOL_DIRECTORY': '/fixture', 'SSL_CERT_FILE': '/fixture/ca.pem',
                     'BE02_FIXTURE_SIGNING_SECRET': values['BE02_FIXTURE_SIGNING_SECRET']}
        for role, key in [('ADMIN', 'POSTGRES_PASSWORD'), ('API', 'API_DB_PASSWORD'), ('WORKER', 'WORKER_DB_PASSWORD')]:
            user = 'supabase_admin' if role == 'ADMIN' else 'elevateo_' + role.lower()
            chain_env['BE02_' + role + '_DATABASE_URL'] = f'postgres://{user}:{values[key]}@{address}:5432/postgres'
        chain_file = task.evidence / '.env.app-chain'
        chain_file.write_text(''.join(f'{key}={value}\n' for key, value in chain_env.items()))
        chain_file.chmod(0o600)
        task.docker('ruby-mox-app-chain', ['run', '--rm', '--network', 'container:' + name,
                    '--read-only', '--memory', '768m', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,size=128m,mode=1777',
                    '--label', 'com.docker.compose.project=' + PROJECT, '--env-file', str(chain_file),
                    '--mount', 'type=bind,src=' + str(PRIVATE / 'runtime') + ',dst=/fixture,readonly',
                    '--mount', 'type=bind,src=' + str(ROOT) + ',dst=/source,readonly',
                    '--mount', 'type=bind,src=' + str(hosts_file) + ',dst=/etc/hosts,readonly',
                    task.image, 'bundle', 'exec', 'ruby', 'test/support/launch_mailflows/app_chain_test.rb',
                    '--name', 'test_real_smtp_ingestion_inbox_and_authorized_reply'], 100)
    except BaseException as error:
        primary = error
    finally:
        finish_fixture(primary, [
            ('credentials', lambda: (task.evidence / '.env.app-chain').unlink(missing_ok=True)),
            ('fixture', lambda: clean_fixture(task, name) if acquired else [])],
            lambda errors: task.write('fixture-cleanup-errors.json', errors))


def main() -> None:
    os.umask(0o077)
    with open('/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock', 'a') as lease:
        # AIDEV-NOTE: Queue once behind other fleet owners; the same lease covers build, proof and cleanup.
        signal.alarm(1800)
        fcntl.flock(lease, fcntl.LOCK_EX)
        signal.alarm(0)
        evidence = ROOT / 'ops/local' / PROJECT
        evidence.mkdir(parents=True, exist_ok=False)
        keys = ('POSTGRES_PASSWORD', 'MIGRATOR_DB_PASSWORD', 'API_DB_PASSWORD', 'WORKER_DB_PASSWORD',
                'ATTACHMENT_GATEWAY_DB_PASSWORD', 'SECRET_KEY_BASE', 'BE02_FIXTURE_SIGNING_SECRET')
        values = {key: secrets.token_hex(32) for key in keys}
        import uuid
        values['MAILFLOW_CONTROL_EPOCH'] = str(uuid.uuid4())
        values['ELEVATEO_SESSION_KEY_BASE64'] = base64.b64encode(secrets.token_bytes(32)).decode()
        task = Task(ROOT, evidence, PROJECT, 'default', values)
        configure_http_approval(task, values['MAILFLOW_CONTROL_EPOCH'])
        env = {**values, 'BE02_SOURCE': str(ROOT), 'BE02_PROJECT': PROJECT, 'BE02_SERVER_IMAGE': task.image}
        task.env_file.write_text(''.join(f'{key}={value}\n' for key, value in env.items()))
        task.env_file.chmod(0o600)
        original = source_hashes(ROOT)
        task.write('source.sha256.json', original)
        status, failure, armed = 'FAILED', '', False
        try:
            endpoint = task.docker('endpoint', ['context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}']).strip()
            if endpoint != 'unix:///var/run/docker.sock':
                raise RuntimeError('nonlocal Docker endpoint')
            for kind in ('container', 'volume', 'network'):
                if task.docker('admit-' + kind, [kind, 'ls', '-q', '--filter', 'label=com.docker.compose.project=' + PROJECT]).strip():
                    raise RuntimeError('namespace exists')
            task.docker('space-before', ['system', 'df'])
            armed = True
            # AIDEV-NOTE: Restore only the immutable prerequisite when its reference is absent; preserve shared images.
            if not task.docker('ruby-prerequisite', ['image', 'ls', '-q', RUBY]).strip():
                task.docker('ruby-prerequisite-pull', ['pull', RUBY], 180)
            # AIDEV-NOTE: Finish compilation before starting the short-lived Mox fixture and its readiness clock.
            task.build()
            # AIDEV-NOTE: All consumers use the immutable build receipt; cleanup retains ownership of the original tag.
            image = task.docker('immutable-image', ['image', 'inspect', '--format', '{{.Id}}', task.image]).strip()
            if not image.startswith('sha256:') or len(image) != 71:
                raise RuntimeError('invalid immutable image receipt')
            task.image = image
            task.write('immutable-image.json', {'image_id': image})
            env['BE02_SERVER_IMAGE'] = image
            task.env_file.write_text(''.join(f'{key}={value}\n' for key, value in env.items()))
            source_failures = check_sources(task)
            # AIDEV-NOTE: Database tests use only this task's newly bootstrapped internal-network PostgreSQL.
            task.compose('database-start', ['up', '-d', '--wait', '--wait-timeout', '120', 'db'], 140)
            bootstrap_database_roles(task)
            # AIDEV-NOTE: Reuse baseline Auth initialization; session migrations require its verified column grants.
            task.compose('auth-start', ['up', '-d', '--wait', '--wait-timeout', '120', 'auth'], 140)
            task.compose('auth-grants', ['run', '--rm', '--no-deps', 'bootstrap', '-f',
                         '/ops/bootstrap-auth-grants.sql'], 45)
            task.compose('migrate', ['run', '--rm', '--no-deps', 'migrate'], 120)
            task.compose('identity-database-tests', ['run', '--rm', '--no-deps', 'test', 'bundle', 'exec',
                         'ruby', '-Itest', '-e', 'ARGV.each { |path| require_relative path }',
                         './test/inbound/mail_identity_database_test.rb', './test/inbound/imap_database_test.rb',
                         './test/sends/reply_identity_database_test.rb',
                         './test/sends/production_mox_database_test.rb'], 120)
            task.compose('http-services', ['up', '-d', '--wait', '--wait-timeout', '90', 'mailpit', 'api'], 110)
            task.wait_http()
            # AIDEV-NOTE: Task tmpfs holds the API's held control; avoid introducing any additional source bind.
            task.compose('http-held-control', ['exec', '-T', 'api', 'ruby', '-rjson', '-e',
                "File.write('/tmp/mailflow-control.json', JSON.generate(epoch: ARGV.fetch(0), outbound_held: true))",
                values['MAILFLOW_CONTROL_EPOCH']], 15)
            protocol(task, values)
            if source_failures:
                raise RuntimeError('; '.join(source_failures))
            status = 'PASSED'
        except Exception as error:
            failure = task.redact(type(error).__name__ + ': ' + str(error))
        finally:
            # AIDEV-NOTE: Retry exact inspected fixture cleanup before generic cleanup, which must reject raw fixtures.
            task.cleanup_mode = True
            task.deadline = time.monotonic() + 240
            try:
                present = task.docker('fixture-backstop-presence', ['container', 'ls', '-aq',
                    '--filter', 'name=^/' + PROJECT + '-mox$']).strip()
                if PRIVATE.exists() or present:
                    errors = clean_fixture(task, PROJECT + '-mox')
                    task.write('fixture-backstop-errors.json', errors)
                    if errors:
                        status, failure = 'FAILED', failure + '; fixture backstop retained resources'
            except BaseException as error:
                status, failure = 'FAILED', failure + '; fixture backstop: ' + str(error)
            status, failure, clean = finalize(task, False, armed, original, status, failure)
            task.docker('space-after', ['system', 'df'])
            stats = os.statvfs(evidence)
            task.write('host-space-after.json', {'free_bytes': stats.f_bavail * stats.f_frsize})
            print(json.dumps({'status': status, 'failure': failure, 'cleanup': clean, 'evidence': str(evidence)}), flush=True)
        if status != 'PASSED' or not clean:
            raise SystemExit(1)


if __name__ == '__main__':
    main()
