import type { Reporter, FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import { basename } from 'node:path';
import { z } from 'zod';
import { loadAcceptanceConfig } from '../shared/config.js';
import { recordCase } from '../shared/report.js';
import { artifactPathSchema, safeText } from '../shared/schema.js';

const metadataSchema = z.strictObject({ partition: safeText, reason: safeText.optional(),
  assertions: z.array(safeText).max(100), evidence: z.array(safeText).max(100),
  artifacts: z.array(artifactPathSchema).max(100) });

// AIDEV-NOTE: Framework errors can contain filled inputs; native error objects never reach a report or stdout.
export default class QuietReporter implements Reporter {
  private pending: Promise<boolean>[] = [];
  onTestEnd(test: TestCase, result: TestResult): void {
    this.pending.push(this.publish(test, result).then(() => true, () => false));
  }
  async onEnd(result: FullResult): Promise<{ status: 'failed' } | void> {
    const writes = await Promise.all(this.pending);
    process.stdout.write(`Acceptance framework status: ${result.status}\n`);
    if (writes.some(write => !write)) {
      process.stderr.write('Acceptance case publication failed; run is incomplete.\n');
      return { status: 'failed' };
    }
  }
  private async publish(test: TestCase, result: TestResult): Promise<void> {
    const config = loadAcceptanceConfig();
    if (!/^SCN-[A-Z]+-\d{3}-(P|F1|F2)$/.test(test.title)) throw new Error('Invalid scenario identity');
    const attempt = `${test.title}.playwright_real.0`;
    let input: unknown;
    try { input = JSON.parse(result.annotations.find(annotation => annotation.type === 'acceptance')?.description ?? 'null'); }
    catch { input = null; }
    const parsed = metadataSchema.safeParse(input);
    const metadata = parsed.success ? parsed.data : undefined;
    // AIDEV-NOTE: Final framework status includes teardown; a successful body cannot hide fixture failure.
    const passed = result.status === 'passed' && (metadata?.assertions.length ?? 0) > 0;
    const start = result.startTime.getTime();
    const elapsed = Math.max(0, Math.round(result.duration));
    await recordCase({ schema_version: 1, run_id: config.runId, dispatch_id: config.dispatchId,
      lane: 'playwright_real', transport_profile: 'internal_http', scenario_path_id: test.title,
      partition: metadata?.partition ?? 'framework-did-not-complete-case', framework_test_id: test.title,
      test_file: `tests/acceptance/playwright/${basename(test.location.file)}`,
      implementation_mode: 'real', attempt: 0, attempt_id: attempt, retry_of: null,
      started_at: new Date(start).toISOString(), ended_at: new Date(start + elapsed).toISOString(),
      duration_ms: elapsed, status: passed ? 'passed' : result.status === 'skipped' ? 'not_run' : 'failed',
      reason: passed ? null : metadata?.reason ?? 'Required browser case did not complete; sensitive diagnostics suppressed',
      authority_variant: 'real-cookie-session-supported-auth-admin-seed', assertions: metadata?.assertions ?? [],
      evidence: metadata?.evidence ?? [], artifacts: metadata?.artifacts ?? [] });
  }
  onError(): void { process.stderr.write('Acceptance framework error; inspect sanitized case records.\n'); }
  printsToStdio(): boolean { return true; }
}
