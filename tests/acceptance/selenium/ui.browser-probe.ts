import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Builder, error } from 'selenium-webdriver';
import { gridConfig, verifyCapabilities } from './boundaries.js';
import { UI } from './ui.js';

// AIDEV-NOTE: Synthetic DOM probes use the isolated Grid, not application case IDs or local driver discovery.
test('fixture-only Selenium plaintext regressions', { timeout: 60000 }, async context => {
  const grid = gridConfig(process.env);
  if (grid.browser !== 'chrome') throw new Error('Fixture requires the pinned Chrome Grid');
  const driver = await new Builder().disableEnvironmentOverrides().usingServer(grid.grid).forBrowser(grid.browser)
    .withCapabilities({ browserName: grid.browser, browserVersion: grid.browserVersion,
      acceptInsecureCerts: false,
      'goog:chromeOptions': { binary: '/opt/google/chrome/chrome', args: ['--headless=new'] } }).build();
  try {
    const capabilities = await driver.getCapabilities();
    verifyCapabilities(grid, key => capabilities.get(key) as unknown);
    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 10000, script: 10000 });
    await driver.manage().window().setRect({ width: 1280, height: 800 });
    await driver.get('about:blank');
    const ui = new UI(driver, 200);
    for (const variant of ['visible', 'literal', 'hidden-node', 'hidden-ancestor', 'transparent-ancestor',
      'invisible-ancestor', 'content-hidden', 'wrong', 'nested', 'empty', 'missing']) {
      await context.test(`plaintext ${variant}`, async () => {
        await driver.executeScript((kind: string) => {
          document.body.replaceChildren();
          const article = document.createElement('article');
          article.setAttribute('aria-label', 'Conversation');
          const pre = document.createElement('pre');
          pre.textContent = kind === 'wrong' ? 'WRONG' : 'ACCEPTANCE_PROBE Literal <b>plain</b> & whitespace.\n';
          article.append(pre);
          document.body.append(article);
          if (kind === 'hidden-node') pre.style.display = 'none';
          if (kind === 'hidden-ancestor') article.hidden = true;
          if (kind === 'transparent-ancestor') article.style.opacity = '0';
          if (kind === 'invisible-ancestor') article.style.visibility = 'hidden';
          if (kind === 'content-hidden') article.style.contentVisibility = 'hidden';
          if (kind === 'empty') pre.textContent = '';
          if (kind === 'missing') pre.remove();
          if (kind === 'nested') {
            const nested = document.createElement('b');
            nested.textContent = 'ACCEPTANCE_PROBE';
            pre.replaceChildren(nested);
          }
          // A visible wrong sibling cannot lend its visibility or child-free shape to a matching node.
          const visible = document.createElement('article');
          visible.setAttribute('aria-label', 'Conversation');
          const other = document.createElement('pre');
          other.textContent = 'WRONG';
          visible.append(other);
          document.body.append(visible);
        }, variant);
        const expected = variant === 'literal' ? 'Literal <b>plain</b> & whitespace.\n' : 'ACCEPTANCE_PROBE';
        if (variant === 'visible' || variant === 'literal') await ui.plaintext(expected);
        else await assert.rejects(ui.plaintext(expected), cause => cause instanceof error.TimeoutError
          && cause.message.includes('Plaintext readiness deadline exceeded'));
      });
    }
  } finally { await driver.quit(); }
});
