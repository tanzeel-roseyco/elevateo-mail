import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAcceptanceConfig, loadSeedContract } from '../shared/config.js';
import { recordCase } from '../shared/report.js';
import { artifactPathSchema, caseResultSchema, seedSchema } from '../shared/schema.js';
import type { CaseResult } from '../shared/schema.js';

// AIDEV-NOTE: Tests run serially because config reads process.env; all files stay in disposable test directories.
const example: unknown = JSON.parse(await readFile(new URL('../../shared/seed-contract.json', import.meta.url), 'utf8'));
function result(overrides: Partial<CaseResult> = {}): CaseResult {
  return {
    schema_version: 1, run_id: 'run_test', dispatch_id: 'dispatch_test', lane: 'playwright_real',
    transport_profile: 'internal_http', scenario_path_id: 'SCN-AUTH-001-P', partition: 'valid invite',
    framework_test_id: 'auth-login', test_file: 'playwright/auth.spec.ts', implementation_mode: 'real',
    attempt: 0, attempt_id: 'SCN-AUTH-001-P.playwright_real.0', retry_of: null,
    started_at: '2026-10-13T00:00:00.000Z', ended_at: '2026-10-13T00:00:00.100Z', duration_ms: 100,
    status: 'failed', reason: 'Synthetic assertion failed', authority_variant: 'manager_primary',
    assertions: ['Authenticated session expected'], evidence: [], artifacts: [], ...overrides,
  };
}
async function fixture(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'acceptance-t0-'));
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) if (key.startsWith('ACCEPTANCE_')) delete process.env[key];
  Object.assign(process.env, {
    ACCEPTANCE_BASE_URL: 'http://app.test', ACCEPTANCE_LANE: 'playwright_real',
    ACCEPTANCE_PROFILE: 'internal_http', ACCEPTANCE_RUN_ID: 'run_test', ACCEPTANCE_DISPATCH_ID: 'dispatch_test',
    ACCEPTANCE_SEED_PATH: join(directory, 'seed.json'), ACCEPTANCE_OUTPUT_DIR: directory,
  });
  try {
    await mkdir(join(directory, 'cases'));
    await writeFile(join(directory, 'seed.json'), JSON.stringify({ ...seedSchema.parse(example), kind: 'runtime' }));
    await action(directory);
  } finally {
    for (const key of Object.keys(process.env)) if (key.startsWith('ACCEPTANCE_')) delete process.env[key];
    Object.assign(process.env, saved);
    await rm(directory, { recursive: true, force: true });
  }
}
test('valid private config and runtime seed; committed example is not runtime evidence', async () => fixture(async dir => {
  assert.equal(loadAcceptanceConfig().baseURL, 'http://app.test');
  assert.equal(loadSeedContract().actors.reader.email, 'reader@acceptance.test');
  await writeFile(join(dir, 'seed.json'), JSON.stringify(example));
  assert.throws(loadSeedContract, /Invalid runtime/);
  await writeFile(join(dir, 'seed.json'), '{');
  assert.throws(loadSeedContract, /Invalid seed JSON/);
}));
test('reject foreign, normalized, credential and query origins; TLS profile is explicit', async () => fixture(async () => {
  for (const origin of ['https://example.com', 'http://app.test/', 'http://app.test?x=1',
    'http://app.test#x', 'http://a:b@app.test', 'http://api:3000', 'http://app.test:80', 'https://app.test']) {
    process.env.ACCEPTANCE_BASE_URL = origin;
    assert.throws(loadAcceptanceConfig, /Invalid acceptance/);
  }
  process.env.ACCEPTANCE_PROFILE = 'tls';
  assert.equal(loadAcceptanceConfig().baseURL, 'https://app.test');
}));
test('required identity/output and resource bounds reject unsafe environment values', async () => fixture(async () => {
  for (const key of ['ACCEPTANCE_RUN_ID', 'ACCEPTANCE_DISPATCH_ID', 'ACCEPTANCE_OUTPUT_DIR', 'ACCEPTANCE_SEED_PATH']) {
    const original = process.env[key]; delete process.env[key];
    assert.throws(loadAcceptanceConfig);
    process.env[key] = original;
  }
  for (const value of ['0', '-1', 'Infinity', '2.5', '10001', '1\n']) {
    process.env.ACCEPTANCE_MAX_RECORDS = value; assert.throws(loadAcceptanceConfig);
  }
}));
test('seed rejects credentials, foreign addresses, duplicate identities and wrong capabilities', () => {
  const seed = seedSchema.parse(example);
  assert.equal(seedSchema.safeParse({ ...seed, password: 'forbidden' }).success, false);
  for (const patch of [{ email: 'reader@example.com' }, { user_id: seed.actors.composer.user_id },
    { capabilities: ['manage'] }, { email: 'reader@acceptance.test\n' }]) {
    assert.equal(seedSchema.safeParse({ ...seed, actors: { ...seed.actors, reader: { ...seed.actors.reader, ...patch } } }).success, false);
  }
});
test('seed matches BE02 read grants and opaque session versions without inventing membership generations', () => {
  const seed = seedSchema.parse(example);
  assert.deepEqual(seed.actors.composer.capabilities, ['read', 'compose']);
  assert.deepEqual(seed.actors.approver.capabilities, ['read', 'compose', 'approve_send']);
  assert.equal(typeof seed.actors.revoked.authorization_version, 'string');
  assert.equal(seed.actors.disabled.authorization_version, null);
  assert.equal(seed.actors.no_membership.authorization_version, null);
  assert.equal(Object.values(seed.actors).every(actor => actor.membership_generation === null), true);
  for (const patch of [{ capabilities: ['compose'] }, { authorization_version: 1 },
    { authorization_version: null }, { authorization_version: 'A'.repeat(42) },
    { authorization_version: 'A'.repeat(44) }, { authorization_version: `${'A'.repeat(43)}\n` },
    { membership_generation: 1 }, { membership_generation: undefined }]) {
    assert.equal(seedSchema.safeParse({ ...seed,
      actors: { ...seed.actors, composer: { ...seed.actors.composer, ...patch } } }).success, false);
  }
});
test('disabled and membership-free actors cannot claim a session version; revoked actor retains org login', () => {
  const seed = seedSchema.parse(example);
  for (const alias of ['disabled', 'no_membership', 'revoked'] as const) {
    const authorization_version = alias === 'revoked' ? null : 'A'.repeat(43);
    assert.equal(seedSchema.safeParse({ ...seed,
      actors: { ...seed.actors, [alias]: { ...seed.actors[alias], authorization_version } } }).success, false);
  }
});
test('reject portable path escapes, Windows device names and encoded paths', () => {
  for (const path of ['../x', '/x', 'C:/x', 'C:\\x', '\\\\host\\x', 'a/../b', 'a//b',
    'a/%2e%2e/b', 'a\\b', 'NUL.txt', 'a/COM1.log', 'a/file.', 'a:stream', 'a/./b', 'a\n'])
    assert.equal(artifactPathSchema.safeParse(path).success, false, path);
  assert.equal(artifactPathSchema.parse('screenshots/auth-1.png'), 'screenshots/auth-1.png');
});
test('unknown input, nonfinite times, bad retries and missing assertions cannot pass', () => {
  for (const invalid of [null, [], { ...result(), token: 'forbidden' }, result({ duration_ms: NaN }),
    result({ duration_ms: Infinity }), result({ duration_ms: -1 }), result({ duration_ms: 99 }),
    result({ attempt: 1 }), result({ status: 'passed', assertions: [] }), result({ reason: null }),
    result({ implementation_mode: 'mock' }), result({ transport_profile: 'native' }),
    result({ run_id: 'run_test\n' }), result({ reason: '   ' }),
    result({ started_at: '1969-01-01T00:00:00.000Z' })])
    assert.equal(caseResultSchema.safeParse(invalid).success, false);
  for (const status of ['not_run', 'blocked', 'skipped'] as const)
    assert.equal(caseResultSchema.parse(result({ status })).status, status);
});
test('immutable attempts preserve first failure and validate predecessor', async () => fixture(async dir => {
  const first = result(); await recordCase(first);
  await assert.rejects(recordCase(result({ status: 'passed' })), /EEXIST/);
  const retry = result({ attempt: 1, attempt_id: 'SCN-AUTH-001-P.playwright_real.1',
    retry_of: first.attempt_id, status: 'passed', reason: null,
    started_at: '2026-10-13T00:00:00.100Z', ended_at: '2026-10-13T00:00:00.200Z' });
  await assert.rejects(recordCase({ ...retry, partition: 'different fixture' }), /failed predecessor/);
  await recordCase(retry);
  const saved: unknown = JSON.parse(await readFile(join(dir, 'cases', `${first.attempt_id}.json`), 'utf8'));
  assert.equal(caseResultSchema.parse(saved).status, 'failed');
  await assert.rejects(recordCase(result({ attempt: 2, attempt_id: 'SCN-AUTH-001-P.playwright_real.2',
    retry_of: retry.attempt_id })), /failed predecessor/);
  assert.equal((await readdir(join(dir, 'cases'))).length, 2);
}));
test('run/lane/profile mismatch and orphan retry write no record', async () => fixture(async dir => {
  for (const changed of [result({ run_id: 'other' }), result({ dispatch_id: 'other' }),
    result({ transport_profile: 'tls' })]) await assert.rejects(recordCase(changed), /does not match/);
  await assert.rejects(recordCase(result({ attempt: 1, attempt_id: 'SCN-AUTH-001-P.playwright_real.1',
    retry_of: 'SCN-AUTH-001-P.playwright_real.0' })), /ENOENT/);
  assert.equal((await readdir(join(dir, 'cases'))).length, 0);
}));
test('record and byte caps fail explicitly without temporary file leakage', async () => fixture(async dir => {
  process.env.ACCEPTANCE_MAX_RECORD_BYTES = '10';
  await assert.rejects(recordCase(result()), /byte limit/);
  delete process.env.ACCEPTANCE_MAX_RECORD_BYTES;
  process.env.ACCEPTANCE_MAX_RECORDS = '1';
  await recordCase(result());
  await assert.rejects(recordCase(result()), /Record limit/);
  assert.equal((await readdir(join(dir, 'cases'))).length, 1);
}));
test('symlink output is rejected before writing', async () => fixture(async dir => {
  const alias = join(dir, 'alias'); await symlink(join(dir, 'cases'), alias, 'dir');
  process.env.ACCEPTANCE_OUTPUT_DIR = alias;
  assert.throws(loadAcceptanceConfig, /canonical/);
}));
test('concurrent duplicate publication preserves one complete record and rejects the duplicate', async () => fixture(async dir => {
  const outcomes = await Promise.allSettled([recordCase(result()), recordCase(result())]);
  assert.deepEqual(outcomes.map(outcome => outcome.status), ['fulfilled', 'rejected']);
  assert.equal((await readdir(join(dir, 'cases'))).length, 1);
}));
