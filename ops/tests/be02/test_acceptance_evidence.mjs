// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedScenarios, validateEvidence } from './acceptance_evidence.mjs';

// AIDEV-NOTE: Same-count substitutions reproduce the prior false pass independently of schema validation.
for (const [lane, scenarios] of Object.entries(expectedScenarios)) {
  const selection = { lane, browser: lane === 'selenium' ? 'chrome' : 'chromium',
    runId: 'run-1', dispatchId: 'dispatch-1', profile: 'internal_http' };
  const records = scenarios.map(scenario_path_id => ({ scenario_path_id, status: 'passed',
    run_id: selection.runId, dispatch_id: selection.dispatchId, lane, transport_profile: 'internal_http',
    implementation_mode: 'real', attempt: 0 }));
  test(`${lane}: complete selected set`, () => {
    assert.equal(records.length, lane === 'playwright_real' ? 26 : 4);
    validateEvidence([...records].reverse(), selection);
  });
  test(`${lane}: duplicate replaces missing at unchanged count`, () => {
    const duplicate = records.map((record, index) => index === 0 ? records[1] : record);
    assert.equal(duplicate.length, records.length);
    assert.throws(() => validateEvidence(duplicate, selection));
  });
  test(`${lane}: missing, empty, and unexpected identities`, () => {
    assert.throws(() => validateEvidence(records.slice(1), selection));
    assert.throws(() => validateEvidence([], selection));
    const unexpected = records.map((record, index) => index === 0
      ? { ...record, scenario_path_id: 'SCN-UNEXPECTED-001-P' } : record);
    assert.throws(() => validateEvidence(unexpected, selection));
  });
  test(`${lane}: schema-valid records from another profile or run cannot pass`, () => {
    for (const change of [{ status: 'not_run' }, { run_id: 'other-run' }, { dispatch_id: 'other-dispatch' },
      { lane: 'unit' }, { transport_profile: 'tls' }, { implementation_mode: 'simulated' }, { attempt: 1 }]) {
      assert.throws(() => validateEvidence(records.map((record, index) => index === 0
        ? { ...record, ...change } : record), selection));
    }
    assert.throws(() => validateEvidence(records, { ...selection, browser: 'unknown' }));
    assert.throws(() => validateEvidence(records, { ...selection, profile: 'tls' }));
    assert.throws(() => validateEvidence(records, { ...selection, lane: 'unknown' }));
  });
}
