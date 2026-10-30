import { Builder } from 'selenium-webdriver';
import type { WebDriver } from 'selenium-webdriver';
import { loadAcceptanceConfig, loadSeedContract } from '../shared/config.js';
import { recordCase } from '../shared/report.js';
import { gridConfig, verifyCapabilities } from './boundaries.js';
import { loadCredentials } from './credentials.js';
import { journeys, login } from './journeys.js';
import { UI } from './ui.js';

// AIDEV-NOTE: No raw framework reporter: WebDriver errors can embed sendKeys arguments and private session URLs.
async function main(): Promise<void> {
  const config = loadAcceptanceConfig();
  if (config.lane !== 'selenium' || config.profile !== 'internal_http' || config.baseURL !== 'http://app.test')
    throw new Error('Invalid Selenium lane configuration');
  let stopped = false;
  for (const journey of journeys) {
    const started = Date.now();
    const record = { assertions: [] as string[], evidence: [] as string[] };
    let driver: WebDriver | undefined;
    let status: 'passed' | 'failed' | 'not_run' = stopped ? 'not_run' : 'failed';
    let reason: string | null = stopped ? 'Previous session could not be closed safely' : 'Selenium journey failed';
    if (!stopped) {
      try {
        const grid = gridConfig(process.env);
        const seed = loadSeedContract();
        const credentials = loadCredentials();
        // AIDEV-NOTE: Selenium's generic environment overrides must not bypass the private Grid allowlist.
        driver = await new Builder().disableEnvironmentOverrides().usingServer(grid.grid).forBrowser(grid.browser)
          .withCapabilities({ browserName: grid.browser, browserVersion: grid.browserVersion,
            acceptInsecureCerts: false,
            // AIDEV-NOTE: Grid's wrapper disables sandboxing; select the pinned ELF binary explicitly.
            'goog:chromeOptions': { binary: '/opt/google/chrome/chrome', args: ['--headless=new'] } }).build();
        const capabilities = await driver.getCapabilities();
        record.evidence.push(verifyCapabilities(grid, key => capabilities.get(key) as unknown));
        const timeout = Math.min(config.limits.timeoutMs, 30000);
        await driver.manage().setTimeouts({ implicit: 0, pageLoad: timeout, script: timeout });
        await driver.manage().window().setRect({ width: 1280, height: 800 });
        const ui = new UI(driver, timeout);
        await login(ui, seed, journey.actor, credentials.passwords[journey.actor]);
        await journey.run(ui, seed, record);
        if (!record.assertions.length) throw new Error('Missing assertion');
        status = 'passed'; reason = null;
      } catch { status = 'failed'; reason = 'Selenium setup or journey assertion failed'; }
      finally {
        if (driver) {
          try { await driver.quit(); }
          catch { status = 'failed'; reason = 'Selenium session cleanup failed'; stopped = true; }
        } else {
          // A rejected session creation can leave a remote orphan; root tears down the isolated Grid after this run.
          stopped = true;
        }
      }
    }
    const ended = Date.now();
    await recordCase({ schema_version: 1, run_id: config.runId, dispatch_id: config.dispatchId,
      lane: 'selenium', transport_profile: 'internal_http', scenario_path_id: journey.id,
      partition: journey.partition, framework_test_id: journey.id, test_file: 'selenium/journeys.ts',
      implementation_mode: 'real', attempt: 0, attempt_id: `${journey.id}.selenium.0`, retry_of: null,
      started_at: new Date(started).toISOString(), ended_at: new Date(ended).toISOString(), duration_ms: ended - started,
      status, reason, authority_variant: journey.actor, ...record, artifacts: [] });
    if (status !== 'passed') process.exitCode = 1;
  }
}
// Only a fixed diagnostic may reach native output; root keeps this output private and seals T0 records.
void main().catch(() => { process.stderr.write('Selenium acceptance runner failed\n'); process.exitCode = 1; });
