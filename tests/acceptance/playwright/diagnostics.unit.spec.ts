import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { caseOutcome } from './quiet-reporter.js';
import { captureDiagnostic, diagnosticReason, diagnosticSchema, frameworkDiagnostic, runCaseBody } from './diagnostics.js';

const source = fileURLToPath(new URL('../../playwright/draft-conflict.e2e.ts', import.meta.url));
const stackAt = (path: string, line = 120, column = 7) => `Error: synthetic-private\n    at body (${path}:${line}:${column})`;
const failure = () => {
  const error = new Error('synthetic-private');
  error.stack = stackAt(source);
  return error;
};
test('completed assertions pass and an empty body remains a failure', async () => {
  const assertions: string[] = [];
  assert.equal(await runCaseBody(async () => { assertions.push('completed'); }, assertions), null);
  assert.deepEqual(await runCaseBody(async () => {}, []),
    { category: 'empty-assertions', phase: 'body', source: null });
});
test('original body errors fail after completed assertions and retain only safe coordinates', async () => {
  const diagnostic = await runCaseBody(async () => { throw failure(); }, ['completed']);
  assert.deepEqual(diagnostic, { category: 'error', phase: 'body',
    source: { file: 'draft-conflict.e2e.ts', line: 120, column: 7 } });
  assert.equal(diagnosticReason(diagnostic),
    'Acceptance failure: body/error at tests/acceptance/playwright/draft-conflict.e2e.ts:120:7');
  assert.equal(JSON.stringify(diagnostic).includes('synthetic-private'), false);
});
test('trusted type and validation errors classify without issue values', () => {
  assert.equal(captureDiagnostic(new TypeError('synthetic-private')).category, 'type');
  const parsed = z.string().safeParse(42);
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.equal(captureDiagnostic(parsed.error).category, 'validation');
});
test('known conflict cleanup and framework failures remain failures with distinct phases', async () => {
  const error = failure();
  error.stack = stackAt(source, 143);
  const diagnostic = await runCaseBody(async () => { throw error; }, ['completed']);
  assert.equal(diagnostic?.phase, 'cleanup');
  assert.deepEqual(frameworkDiagnostic(stackAt(source), 'synthetic-private'), { category: 'unknown', phase: 'framework',
    source: { file: 'draft-conflict.e2e.ts', line: 120, column: 7 } });
  assert.equal(frameworkDiagnostic(undefined, undefined).source, null);
});
test('untrusted errors cannot supply categories or invoke arbitrary stack getters', () => {
  let reads = 0;
  const fake = { name: 'TypeError', get stack() { reads++; return stackAt(source); } };
  for (const error of [fake, null, undefined, 'synthetic-private', 42])
    assert.deepEqual(captureDiagnostic(error), { category: 'unknown', phase: 'body', source: null });
  assert.equal(reads, 0);
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.equal(captureDiagnostic(revoked.proxy).category, 'unknown');
  assert.equal(diagnosticReason(revoked.proxy), 'Acceptance failure: unknown diagnostic');
  assert.equal(diagnosticReason({ get category() { throw new Error('synthetic-private'); } }),
    'Acceptance failure: unknown diagnostic');
});
test('source parsing rejects paths, coordinate limits, message-only frames and oversized stacks', () => {
  for (const stack of [stackAt('/tmp/draft-conflict.e2e.ts'), stackAt(source + '/../../private'),
    stackAt(source, 0), stackAt(source, 146), stackAt(source, 120, 0), stackAt(source, 120, 1001),
    `    at body (${source}:120:7)`, 'x'.repeat(32769)]) {
    assert.equal(frameworkDiagnostic(stack, 'synthetic-private').source, null);
  }
});
test('strict schema rejects raw fields, arbitrary enums, paths and noninteger coordinates', () => {
  const valid = captureDiagnostic(failure());
  for (const input of [null, { ...valid, message: 'synthetic-private' }, { ...valid, category: 'credential' },
    { ...valid, phase: 'payload' }, ...[
      { file: '../private', line: 1, column: 1 }, { file: 'draft-conflict.e2e.ts', line: 1.5, column: 1 },
      { file: 'draft-conflict.e2e.ts', line: 1, column: 1, stack: 'synthetic-private' },
    ].map(source => ({ ...valid, source }))]) {
    assert.equal(diagnosticSchema.safeParse(input).success, false);
    assert.equal(diagnosticReason(input), 'Acceptance failure: unknown diagnostic');
  }
});

test('multiline messages cannot supply frame-shaped body or cleanup coordinates', () => {
  const message = `synthetic-private\n    at payload (${source}:143:1)`;
  const error = new Error(message);
  error.stack = `Error: ${message}\n    at body (${source}:120:7)`;
  assert.equal(captureDiagnostic(error).source?.line, 120);
  assert.equal(captureDiagnostic(error).phase, 'body');
  assert.equal(frameworkDiagnostic(error.stack, message).source?.line, 120);
  assert.equal(frameworkDiagnostic(error.stack, undefined).source, null);
});
test('reporter rejects malicious metadata and never publishes annotation reasons or framework messages', () => {
  const metadata = { partition: 'synthetic', assertions: ['completed'], evidence: [], artifacts: [],
    reason: 'synthetic-private expected/actual', diagnostic: null };
  const errors = [{ message: 'synthetic-private', stack: stackAt(source) }];
  assert.equal(caseOutcome({ status: 'passed', errors: [] }, metadata).passed, true);
  const failed = caseOutcome({ status: 'failed', errors }, metadata);
  assert.equal(failed.passed, false);
  assert.equal(failed.reason, 'Acceptance failure: framework/unknown at tests/acceptance/playwright/draft-conflict.e2e.ts:120:7');
  assert.equal(caseOutcome({ status: 'passed', errors: [] }, { ...metadata, assertions: [] }).passed, false);
  for (const diagnostic of [{ category: 'raw', phase: 'body', source: null },
    { category: 'error', phase: 'body', source: { file: '../private', line: 1, column: 1 } }]) {
    const rejected = caseOutcome({ status: 'failed', errors: [] }, { ...metadata, diagnostic });
    assert.equal(rejected.metadata, undefined);
    assert.equal(rejected.reason, 'Acceptance failure: framework/unknown at unknown source');
  }
  assert.equal(caseOutcome({ status: 'skipped', errors: [] }, metadata).reason,
    'Acceptance case unavailable; see source scenario inventory');
});

test('assigned native stacks work while custom Error stack getters remain unread', () => {
  const native = failure();
  assert.equal(captureDiagnostic(native).source?.line, 120);
  let reads = 0;
  Object.defineProperty(native, 'stack', { get() { reads++; return stackAt(source, 143); }, configurable: true });
  assert.deepEqual(captureDiagnostic(native), { category: 'error', phase: 'body', source: null });
  assert.equal(reads, 0);
});


test('explicit data-property stacks retain exact body and cleanup coordinates', () => {
  for (const line of [120, 143]) {
    const error = new Error('synthetic-private');
    Object.defineProperty(error, 'stack', { value: stackAt(source, line), configurable: true });
    assert.deepEqual(captureDiagnostic(error), { category: 'error', phase: line === 143 ? 'cleanup' : 'body',
      source: { file: 'draft-conflict.e2e.ts', line, column: 7 } });
  }
});

test('bootstrap formatter descriptor is restored after native extraction and rejected stack values', () => {
  const original = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
  assert.deepEqual(captureDiagnostic(failure()), { category: 'error', phase: 'body',
    source: { file: 'draft-conflict.e2e.ts', line: 120, column: 7 } });
  assert.deepEqual(Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace'), original);
  const unformatted = new Error('synthetic-private');
  assert.equal(captureDiagnostic(unformatted).source, null);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace'), original);
  const rejected = failure();
  rejected.stack = 'x'.repeat(32769);
  assert.equal(captureDiagnostic(rejected).source, null);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace'), original);
});

test('changed bootstrap descriptor flags are rejected without changing the current descriptor', () => {
  const original = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
  assert.ok(original && 'value' in original && original.configurable);
  try {
    const changed = { ...original, enumerable: !original.enumerable };
    Object.defineProperty(Error, 'prepareStackTrace', changed);
    assert.equal(captureDiagnostic(failure()).source, null);
    assert.deepEqual(Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace'), changed);
  } finally { Object.defineProperty(Error, 'prepareStackTrace', original); }
});

test('unformatted native errors never read unsafe name or message properties or coerce values', () => {
  for (const key of ['name', 'message']) {
    for (const inherited of [false, true]) {
      const error = new Error('synthetic-private');
      let reads = 0;
      const target: object = inherited ? Object.create(Error.prototype) : error;
      Object.defineProperty(target, key, { get() { reads++; return 'synthetic-private'; } });
      if (inherited) {
        if (key === 'message') Reflect.deleteProperty(error, 'message');
        Object.setPrototypeOf(error, target);
      }
      const diagnostic = captureDiagnostic(error);
      assert.equal(diagnostic.source, null);
      assert.equal(reads, 0);
      assert.equal(JSON.stringify(diagnostic).includes('synthetic-private'), false);
    }
    const error = new Error('synthetic-private');
    let coercions = 0;
    Object.defineProperty(error, key, { value: { toString() { coercions++; return 'synthetic-private'; } } });
    assert.equal(captureDiagnostic(error).source, null);
    assert.equal(coercions, 0);
  }
});
test('native extraction never invokes a custom prepareStackTrace hook or getter', () => {
  const original = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
  let reads = 0;
  try {
    const error = new Error('synthetic-private');
    Object.defineProperty(Error, 'prepareStackTrace', { configurable: true,
      value: () => { reads++; return stackAt(source, 143); } });
    const diagnostic = captureDiagnostic(error);
    assert.equal(diagnostic.source, null);
    assert.equal(reads, 0);
    assert.equal(JSON.stringify(diagnostic).includes('synthetic-private'), false);
    const next = new Error('synthetic-private');
    Object.defineProperty(Error, 'prepareStackTrace', { configurable: true,
      get() { reads++; return () => stackAt(source, 143); } });
    const nextDiagnostic = captureDiagnostic(next);
    assert.equal(nextDiagnostic.source, null);
    assert.equal(reads, 0);
    assert.equal(JSON.stringify(nextDiagnostic).includes('synthetic-private'), false);
  } finally {
    if (original) Object.defineProperty(Error, 'prepareStackTrace', original);
    else Reflect.deleteProperty(Error, 'prepareStackTrace');
  }
});

test('invitation source registration publishes coordinates only and rejects beyond frozen bounds', () => {
  const invitation = fileURLToPath(new URL('../../playwright/auth-invite.e2e.ts', import.meta.url));
  assert.equal(frameworkDiagnostic(stackAt(invitation, 1), 'synthetic-private').source?.file, 'auth-invite.e2e.ts');
  assert.equal(frameworkDiagnostic(stackAt(invitation, 1000), 'synthetic-private').source, null);
});

test('settled reader source accepts its final line and rejects coordinates past the file', () => {
  const reader = fileURLToPath(new URL('../../playwright/read.e2e.ts', import.meta.url));
  assert.equal(frameworkDiagnostic(stackAt(reader, 97), 'synthetic-private').source?.line, 97);
  assert.equal(frameworkDiagnostic(stackAt(reader, 98), 'synthetic-private').source, null);
});

test('supplemental feature and screenshot failures expose only reviewed bounded coordinates', () => {
  for (const [name, lastLine] of [
    ['qa816-assignee-ui.e2e.ts', 79], ['qa816-attachment-ui.e2e.ts', 97],
    ['qa816-feature-wave.e2e.ts', 46], ['screenshots.ts', 83],
  ] as const) {
    const file = fileURLToPath(new URL(`../../playwright/${name}`, import.meta.url));
    const accepted = frameworkDiagnostic(stackAt(file, lastLine), 'synthetic-private');
    assert.deepEqual(accepted.source, { file: name, line: lastLine, column: 7 });
    assert.equal(JSON.stringify(accepted).includes('synthetic-private'), false);
    assert.equal(frameworkDiagnostic(stackAt(file, lastLine + 1), 'synthetic-private').source, null);
  }
});
