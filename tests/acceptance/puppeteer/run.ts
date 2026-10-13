import puppeteer from 'puppeteer-core';
import type { Browser, BrowserContext } from 'puppeteer-core';
import { loadAcceptanceConfig, loadSeedContract } from '../shared/config.js';
import { recordCase } from '../shared/report.js';
import type { CaseResult } from '../shared/schema.js';
import { parseSettings, verifyVersion } from './boundaries.js';
import { loadCredentials, validateExecutable } from './files.js';
import { journeys, login } from './journeys.js';
import { UI } from './ui.js';

// AIDEV-NOTE: Root watchdog owns hard deadlines and orphan cleanup; protocol timeouts are not process cancellation.
async function main(): Promise<void> {
  const config = loadAcceptanceConfig();
  if (config.lane !== 'puppeteer_cdp' || config.profile !== 'internal_http') throw new Error('Invalid lane');
  let stopped = false;
  for (const journey of journeys) {
    const started = Date.now();
    let status: CaseResult['status'] = 'not_run';
    let reason: string | null = 'Earlier setup or journey failed';
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let active = false;
    const assertions: string[] = [];
    const evidence: string[] = [];
    if (!stopped) {
      try {
        const settings = parseSettings({ origin: config.baseURL, executable: process.env.PUPPETEER_EXECUTABLE_PATH,
          version: process.env.PUPPETEER_EXPECTED_BROWSER_VERSION, uid: process.getuid?.() });
        validateExecutable(settings.executable);
        const seed = loadSeedContract();
        const credentials = loadCredentials();
        const timeout = Math.min(config.limits.timeoutMs, 30000);
        browser = await puppeteer.launch({ executablePath: settings.executable, headless: true,
          timeout, protocolTimeout: timeout, dumpio: false, args: [] });
        verifyVersion(await browser.version(), settings.version);
        evidence.push(`Exact browser version verified: ${settings.version}`);
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        const ui = new UI(page, timeout);
        active = true;
        await login(ui, seed, journey.actor, credentials.passwords[journey.actor]);
        await journey.run(ui, seed);
        assertions.push(journey.assertion);
        status = 'passed';
        reason = null;
      } catch {
        status = active ? 'failed' : 'not_run';
        reason = active ? 'GUI journey failed; raw diagnostic withheld' : 'Browser, credential or seed setup unavailable';
        stopped = true;
      } finally {
        try { await context?.close(); }
        catch { status = 'failed'; reason = 'Browser context cleanup failed'; stopped = true; }
        try { await browser?.close(); }
        catch { status = 'failed'; reason = 'Browser cleanup failed'; stopped = true; }
      }
    }
    const ended = Date.now();
    await recordCase({ schema_version: 1, run_id: config.runId, dispatch_id: config.dispatchId,
      lane: 'puppeteer_cdp', transport_profile: 'internal_http', scenario_path_id: journey.id,
      partition: journey.partition, framework_test_id: journey.id, test_file: 'puppeteer/journeys.ts',
      implementation_mode: 'real', attempt: 0, attempt_id: `${journey.id}.puppeteer_cdp.0`, retry_of: null,
      started_at: new Date(started).toISOString(), ended_at: new Date(ended).toISOString(), duration_ms: ended - started,
      status, reason, authority_variant: journey.actor, assertions, evidence, artifacts: [] });
    if (status !== 'passed') process.exitCode = 1;
  }
}
void main().catch(() => { process.stderr.write('Puppeteer acceptance runner failed\n'); process.exitCode = 1; });
