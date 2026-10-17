import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import puppeteer from 'puppeteer-core';
import { parseSettings, verifyVersion } from './boundaries.js';
import { validateExecutable } from './files.js';
import { UI } from './ui.js';

async function probe(context: TestContext, name: string, operation: () => Promise<void>): Promise<void> {
  await context.test(name, async () => {
    try { await operation(); }
    catch { throw new Error('Fixture browser probe failed; diagnostic withheld'); }
  });
}
// AIDEV-NOTE: Synthetic DOM/redirect probes exercise the browser predicate, never application acceptance case IDs.
test('fixture-only browser regressions', { timeout: 60000 }, async context => {
  const settings = parseSettings({ origin: 'http://app.test', executable: process.env.PUPPETEER_EXECUTABLE_PATH,
    version: process.env.PUPPETEER_EXPECTED_BROWSER_VERSION, uid: process.getuid?.() });
  validateExecutable(settings.executable);
  const browser = await puppeteer.launch({ executablePath: settings.executable, headless: true,
    dumpio: false, timeout: 15000, protocolTimeout: 15000, args: [] });
  try {
    verifyVersion(await browser.version(), settings.version);
    const page = await browser.newPage();
    const ui = new UI(page, 200);
    for (const variant of ['visible', 'hidden-node', 'hidden-ancestor', 'transparent-ancestor',
      'invisible-ancestor', 'wrong', 'nested', 'literal']) {
      await probe(context, `plaintext ${variant}`, async () => {
        await page.evaluate(kind => {
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
          if (kind === 'nested') {
            const nested = document.createElement('b');
            nested.textContent = 'ACCEPTANCE_PROBE';
            pre.replaceChildren(nested);
          }
          // A visible nonmatching pre must not lend visibility to a hidden matching sibling.
          const other = document.createElement('pre');
          other.textContent = 'WRONG';
          const visible = document.createElement('article');
          visible.setAttribute('aria-label', 'Conversation');
          visible.append(other);
          document.body.append(visible);
        }, variant);
        const expected = variant === 'literal' ? 'Literal <b>plain</b> & whitespace.\n' : 'ACCEPTANCE_PROBE';
        if (variant === 'visible' || variant === 'literal') await ui.plaintext(expected);
        else await assert.rejects(ui.plaintext(expected));
      });
    }
    await page.setRequestInterception(true);
    let interceptionFailed = false;
    page.on('request', request => {
      void request.respond(request.url().startsWith('http://app.test/')
        ? { status: 302, headers: { location: 'http://peer.test/' } }
        : { status: 200, contentType: 'text/html', body: '<!doctype html><body></body>' })
        .catch(() => { interceptionFailed = true; });
    });
    await probe(context, 'redirected credential form receives no synthetic input', async () => {
      await page.goto('http://app.test/');
      await page.evaluate(() => {
        const label = document.createElement('label');
        label.textContent = 'Password';
        const input = document.createElement('input');
        input.type = 'password';
        label.append(input);
        document.body.append(label);
      });
      await assert.rejects(ui.fill('Password', 'synthetic-password', true),
        { message: 'Credential destination rejected' });
      assert.equal(await page.$eval('input', input => input.value.length), 0);
      assert.equal(interceptionFailed, false);
    });
  } catch { throw new Error('Fixture browser setup failed; diagnostic withheld'); }
  finally {
    try { await browser.close(); }
    catch { throw new Error('Fixture browser cleanup failed; diagnostic withheld'); }
  }
});
