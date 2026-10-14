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
