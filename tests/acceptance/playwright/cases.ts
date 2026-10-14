import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { runCaseBody } from './diagnostics.js';

type Evidence = { assertions: string[]; evidence: string[]; artifacts: string[] };
// AIDEV-NOTE: Only completed assertions enter records; only allowlisted diagnostics survive body errors.
export function scenario(id: string, partition: string,
  body: (page: Page, evidence: Evidence) => Promise<void>): void {
  test(id, async ({ page }) => {
    const evidence: Evidence = { assertions: [], evidence: [], artifacts: [] };
    const diagnostic = await runCaseBody(() => body(page, evidence), evidence.assertions);
    test.info().annotations.push({ type: 'acceptance', description: JSON.stringify({ partition, ...evidence, diagnostic }) });
    if (diagnostic) throw new Error('Acceptance case failed; see sanitized record');
  });
}
export function unavailable(id: string, reason: string): void {
  test(id, async () => {
    test.info().annotations.push({ type: 'acceptance', description: JSON.stringify({
      partition: 'unavailable-control', reason, assertions: [], evidence: [], artifacts: [] }) });
    test.skip(true, reason);
  });
}
