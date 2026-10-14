// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedScenarios, validateEvidence, validateDiagnosticEvidence, validateFocusedEvidence } from './acceptance_evidence.mjs';

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

// AIDEV-NOTE: Diagnostic success cannot stand in for the exhaustive scenario gate.
test('diagnostic has a separate closed inventory and cannot satisfy full acceptance', () => {
  const selected = { lane: 'playwright_real', browser: 'chromium', profile: 'internal_http', runId: 'diag', dispatchId: 'actual' };
  const rows = ['SCN-AUTH-001-P', 'SCN-READ-002-P', 'SCN-DRAFT-001-P', 'SCN-GUI-006-P'].map(id => ({
    scenario_path_id: id, status: 'passed', run_id: 'diag', dispatch_id: 'actual', lane: 'playwright_real',
    transport_profile: 'internal_http', implementation_mode: 'real', attempt: 0,
  }));
  assert.doesNotThrow(() => validateDiagnosticEvidence(rows, selected));
  assert.throws(() => validateEvidence(rows, selected));
  assert.throws(() => validateDiagnosticEvidence(rows.slice(1), selected));
  assert.throws(() => validateDiagnosticEvidence([...rows, rows[0]], selected));
  assert.throws(() => validateDiagnosticEvidence([{ ...rows[0], status: 'not_run' }, ...rows.slice(1)], selected));
  assert.throws(() => validateDiagnosticEvidence(rows, { ...selected, dispatchId: 'different' }));
});

test('focused real case remains scoped and rejects incomplete or substituted evidence', () => {
  const selection = { lane: 'playwright_real', browser: 'chromium', profile: 'internal_http',
    runId: 'focused-run', dispatchId: 'focused-dispatch', caseId: 'SCN-DRAFT-003-P' };
  const record = { scenario_path_id: selection.caseId, status: 'passed', run_id: selection.runId,
    dispatch_id: selection.dispatchId, lane: selection.lane, transport_profile: selection.profile,
    implementation_mode: 'real', attempt: 0 };
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    assert.doesNotThrow(() => validateFocusedEvidence([record], { ...selection, browser }));
  }
  assert.throws(() => validateEvidence([record], selection));
  assert.throws(() => validateDiagnosticEvidence([record], selection));
  assert.throws(() => validateFocusedEvidence([], selection));
  assert.throws(() => validateFocusedEvidence([record, record], selection));
  for (const change of [{ scenario_path_id: 'SCN-DRAFT-003-F1' }, { status: 'failed' }, { status: 'not_run' },
    { run_id: 'foreign-run' }, { dispatch_id: 'foreign-dispatch' }, { lane: 'unit' }, { transport_profile: 'tls' },
    { implementation_mode: 'simulated' }, { attempt: 1 }]) {
    assert.throws(() => validateFocusedEvidence([{ ...record, ...change }], selection));
  }
  for (const change of [{ browser: 'unknown' }, { lane: 'puppeteer_cdp' }, { profile: 'tls' },
    { caseId: '.*' }, { caseId: '' }, { caseId: 'SCN-DRAFT-003-P\n' }, { runId: '' }, { dispatchId: '' }]) {
    assert.throws(() => validateFocusedEvidence([record], { ...selection, ...change }));
  }
  for (const suffix of ['\n', '\r', '\r\n']) {
    const caseId = selection.caseId + suffix;
    assert.throws(() => validateFocusedEvidence([{ ...record, scenario_path_id: caseId }], { ...selection, caseId }));
  }
});
