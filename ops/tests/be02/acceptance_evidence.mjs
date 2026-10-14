// @ts-check
// AIDEV-NOTE: Frozen producer identities include unavailable cases; missing controls must never earn PASSED.
export const expectedScenarios = Object.freeze({
  playwright_real: Object.freeze([
    'SCN-AUTH-001-P', 'SCN-AUTH-001-F1', 'SCN-AUTH-001-F2',
    'SCN-AUTH-003-P', 'SCN-AUTH-003-F1', 'SCN-AUTH-003-F2', 'SCN-AUTH-006-P', 'SCN-AUTH-007-F1',
    'SCN-READ-001-P', 'SCN-READ-001-F1', 'SCN-READ-001-F2',
    'SCN-READ-002-P', 'SCN-READ-002-F1', 'SCN-READ-002-F2',
    'SCN-DRAFT-001-P', 'SCN-DRAFT-001-F1', 'SCN-DRAFT-001-F2',
    'SCN-DRAFT-003-P', 'SCN-DRAFT-003-F1', 'SCN-DRAFT-003-F2',
    'SCN-DRAFT-008-P', 'SCN-DRAFT-008-F1', 'SCN-DRAFT-008-F2',
    'SCN-GUI-006-P', 'SCN-GUI-006-F1', 'SCN-GUI-006-F2',
  ]),
  puppeteer_cdp: Object.freeze(['SCN-AUTH-001-P', 'SCN-READ-002-P', 'SCN-DRAFT-001-P', 'SCN-AUTH-003-P']),
  selenium: Object.freeze(['SCN-AUTH-001-P', 'SCN-READ-002-P', 'SCN-DRAFT-001-P', 'SCN-AUTH-003-P']),
});

/**
 * @param {ReadonlyArray<{scenario_path_id: string, status: string, run_id: string, dispatch_id: string,
 * lane: string, transport_profile: string, implementation_mode: string, attempt: number}>} records
 * @param {{lane: string, browser: string, runId: string, dispatchId: string, profile: string}} selection
 */
export function validateEvidence(records, selection) {
  const { lane, browser, runId, dispatchId, profile } = selection;
  if (!(lane === 'playwright_real' && ['chromium', 'firefox', 'webkit'].includes(browser)
    || lane === 'puppeteer_cdp' && browser === 'chromium' || lane === 'selenium' && browser === 'chrome')
    || profile !== 'internal_http' || !runId || !dispatchId) throw new Error('Invalid selected evidence profile');
  const expected = new Set(expectedScenarios[/** @type {keyof typeof expectedScenarios} */ (lane)]);
  /** @type {Set<string>} */
  const seen = new Set();
  for (const record of records) {
    if (!expected.has(record.scenario_path_id) || seen.has(record.scenario_path_id)
      || record.status !== 'passed' || record.run_id !== runId || record.dispatch_id !== dispatchId
      || record.lane !== lane || record.transport_profile !== profile
      || record.implementation_mode !== 'real' || record.attempt !== 0)
      throw new Error('Incomplete or mismatched acceptance evidence');
    seen.add(record.scenario_path_id);
  }
  if (seen.size !== expected.size) throw new Error('Missing acceptance scenarios');
}

// AIDEV-NOTE: Smoke evidence has its own closed inventory and cannot validate the required full acceptance set.
/**
 * @param {Parameters<typeof validateEvidence>[0]} records
 * @param {Parameters<typeof validateEvidence>[1]} selection
 */
export function validateDiagnosticEvidence(records, selection) {
  if (selection.lane !== 'playwright_real' || selection.browser !== 'chromium' || selection.profile !== 'internal_http')
    throw new Error('Diagnostic requires real internal Chromium');
  const required = new Set(['SCN-AUTH-001-P', 'SCN-READ-002-P', 'SCN-DRAFT-001-P', 'SCN-GUI-006-P']);
  for (const record of records) {
    if (!required.delete(record.scenario_path_id) || record.status !== 'passed' || record.attempt !== 0
      || record.implementation_mode !== 'real' || record.run_id !== selection.runId || record.dispatch_id !== selection.dispatchId
      || record.lane !== selection.lane || record.transport_profile !== selection.profile)
      throw new Error('Incomplete or mismatched diagnostic smoke');
  }
  if (required.size !== 0) throw new Error('Missing diagnostic smoke case');
}

// AIDEV-NOTE: One fresh-dataset case earns only scoped diagnostic evidence; it cannot satisfy the frozen full inventory.
/**
 * @param {Parameters<typeof validateEvidence>[0]} records
 * @param {Parameters<typeof validateEvidence>[1] & {caseId: string}} selection
 */
export function validateFocusedEvidence(records, selection) {
  if (selection.lane !== 'playwright_real' || !['chromium', 'firefox', 'webkit'].includes(selection.browser)
    || selection.profile !== 'internal_http' || !selection.runId || !selection.dispatchId
    || !/^SCN-[A-Z]+-\d{3}-(P|F1|F2)$/.test(selection.caseId)
    || selection.caseId !== selection.caseId.trim() || records.length !== 1)
    throw new Error('Focused evidence requires one real Playwright case');
  const record = records[0];
  if (!record || record.scenario_path_id !== selection.caseId || record.status !== 'passed' || record.attempt !== 0
    || record.implementation_mode !== 'real' || record.run_id !== selection.runId || record.dispatch_id !== selection.dispatchId
    || record.lane !== selection.lane || record.transport_profile !== selection.profile)
    throw new Error('Incomplete or mismatched focused evidence');
}
