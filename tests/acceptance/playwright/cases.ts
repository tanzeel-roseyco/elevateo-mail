import { test } from '@playwright/test';
import type { Page } from '@playwright/test';

type Evidence = { assertions: string[]; evidence: string[]; artifacts: string[] };
// AIDEV-NOTE: Only completed assertions enter records; exceptions are deliberately stripped of browser data.
export function scenario(id: string, partition: string,
  body: (page: Page, evidence: Evidence) => Promise<void>): void {
  test(id, async ({ page }) => {
    const evidence: Evidence = { assertions: [], evidence: [], artifacts: [] };
    let failed = false;
    try { await body(page, evidence); if (!evidence.assertions.length) failed = true; }
    catch { failed = true; }
    test.info().annotations.push({ type: 'acceptance', description: JSON.stringify({ partition, ...evidence }) });
    if (failed) throw new Error('Acceptance case failed; see sanitized record');
  });
}
export function unavailable(id: string, reason: string): void {
  test(id, async () => {
    test.info().annotations.push({ type: 'acceptance', description: JSON.stringify({
      partition: 'unavailable-control', reason, assertions: [], evidence: [], artifacts: [] }) });
    test.skip(true, reason);
  });
}
