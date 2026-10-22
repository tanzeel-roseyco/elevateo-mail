// AIDEV-NOTE: Isolated Docker test doubles exercise edge routing without credentials or live provider traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const servers = [];
let child;
let assertions = 0;
async function upstream(port, label) {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ label, path: request.url, headers: request.headers }));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  servers.push(server);
}
function check(actual, expected) { assert.equal(actual, expected); assertions++; }
function portValidation() {
  // AIDEV-NOTE: Mark downstream commands so rejection proves ordering, not merely eventual process failure.
  const bin = fs.mkdtempSync('/tmp/edge-port-');
  const marker = bin + '/called';
  for (const command of ['base64', 'envsubst', 'ssh', 'nginx']) {
    fs.writeFileSync(bin + '/' + command,
      `#!/bin/bash\nprintf '%s\\n' '${command}' >> '${marker}'\n` +
      (['ssh', 'nginx'].includes(command) ? 'sleep 0.2\n' : '') + 'exit 0\n', { mode: 0o700 });
  }
  const env = { ...process.env, PORT: '8080', FLEET_SSH_PORT: '22', PATH: bin + ':' + process.env.PATH,
    FLEET_SSH_HOST: 'example.invalid', FLEET_FORWARD_USER: 'forward',
    FLEET_FORWARD_KEY_BASE64: 'test-only', FLEET_KNOWN_HOSTS_BASE64: 'test-only' };
  function run(overrides) {
    fs.rmSync(marker, { force: true });
    fs.rmSync('/tmp/elevateo-ssh', { recursive: true, force: true });
    const candidate = { ...env, ...overrides };
    for (const name of Object.keys(candidate)) if (candidate[name] === undefined) delete candidate[name];
    return spawnSync('/usr/local/bin/elevateo-start', [], { env: candidate, timeout: 3000 });
  }
  try {
    for (const name of ['PORT', 'FLEET_SSH_PORT']) {
      for (const value of [undefined, '', 'abc', '0', '-1', '+22', ' 22', '22 ', '22\n',
        '08', '00022', '65536', '99999', '18446744073709551617', '1+1', '1.5']) {
        const result = run({ [name]: value });
        check(result.error, undefined);
        check(result.status, 1);
        check(result.stderr.toString().trim(), `${name} must be a canonical decimal port in 1..65535`);
        check(fs.existsSync(marker), false);
        check(fs.existsSync('/tmp/elevateo-ssh'), false);
      }
    }
    for (const value of ['1', '22', '8080', '65535']) {
      const result = run({ PORT: value, FLEET_SSH_PORT: value });
      check(result.error, undefined);
      // Brief child stubs prove validation accepted; the routing checks below prove actual nginx readiness.
      check(result.status, 1);
      check(result.stderr.toString(), '');
      const calls = fs.readFileSync(marker, 'utf8').trim().split('\n');
      check(calls.filter((call) => call === 'base64').length, 2);
      for (const command of ['envsubst', 'ssh', 'nginx']) check(calls.includes(command), true);
    }
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync('/tmp/elevateo-ssh', { recursive: true, force: true });
  }
}
async function main() {
  execFileSync('bash', ['-n', '/usr/local/bin/elevateo-start']);
  portValidation();
  fs.mkdirSync('/tmp/mockbin', { recursive: true });
  fs.writeFileSync('/tmp/mockbin/ssh', '#!/bin/bash\nprintf "%s\\n" "$@" > /tmp/ssh-args\necho $$ > /tmp/mock-ssh-pid\nexec sleep 300\n', { mode: 0o700 });
  await upstream(4710, 'api');
  await upstream(4711, 'auth');
  child = spawn('/usr/local/bin/elevateo-start', [], {
    env: { ...process.env, PORT: '18080', PATH: '/tmp/mockbin:' + process.env.PATH,
      FLEET_SSH_HOST: 'example.invalid', FLEET_FORWARD_USER: 'forward', FLEET_SSH_PORT: '2223',
      FLEET_FORWARD_KEY_BASE64: Buffer.from('test-only').toString('base64'),
      FLEET_KNOWN_HOSTS_BASE64: Buffer.from('test-only').toString('base64') },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { ready = (await fetch('http://127.0.0.1:18080/edge-health')).status === 200; } catch {}
    if (ready) break;
    await delay(100);
  }
  check(ready, true);
  for (const path of ['/webhooks/resend', '/v2/provider-events/resend']) {
    check((await fetch('http://127.0.0.1:18080' + path)).status, 503);
  }
  for (const path of ['/auth/v1/token', '/auth/v1/admin/users', '/auth/v1/user']) {
    check((await fetch('http://127.0.0.1:18080' + path)).status, 404);
  }
  for (const path of ['/v1/auth/sso/status', '/v2/mailboxes', '/health', '/ready']) {
    const response = await fetch('http://127.0.0.1:18080' + path, {
      headers: { 'X-Forwarded-For': 'evil', Forwarded: 'evil', 'X-Forwarded-Proto': 'http' },
    });
    const data = await response.json();
    check(data.label, 'api'); check(data.path, path);
    check(data.headers.host, 'mail.elevateoco.com');
    check(data.headers['x-forwarded-proto'], 'https');
    check(data.headers.forwarded, undefined); check(data.headers['x-forwarded-for'], undefined);
    check(response.headers.get('cache-control'), 'no-store');
    check(response.headers.get('referrer-policy'), 'no-referrer');
  }
  for (const path of ['/authorize?provider=google&state=test', '/callback?code=test']) {
    const data = await (await fetch('http://127.0.0.1:18080/auth/v1' + path)).json();
    check(data.label, 'auth'); check(data.path, path);
  }
  const args = fs.readFileSync('/tmp/ssh-args', 'utf8');
  check(args.includes('127.0.0.1:4710:launch-api:3000'), true);
  check(args.includes('127.0.0.1:4711:oauth-proxy:8080'), true);
  check(fs.statSync('/tmp/elevateo-ssh/key').mode & 0o777, 0o600);
  process.kill(Number(fs.readFileSync('/tmp/mock-ssh-pid', 'utf8')), 'SIGTERM');
  check(await Promise.race([exited, delay(3000).then(() => 'timeout')]), 1);
  console.log(`PASS: ${assertions} isolated edge assertions; no live API calls`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
});
