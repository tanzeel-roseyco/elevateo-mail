import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Page } from 'puppeteer-core';
import type { WebDriver, WebElement } from 'selenium-webdriver';
import { UI as PuppeteerUI } from '../puppeteer/ui.js';
import { UI as SeleniumUI } from '../selenium/ui.js';
import { fillSignInCredentials } from './credential-origin.js';

// AIDEV-NOTE: Narrow browser doubles reach the real fill methods; only synthetic values enter these probes.
for (const framework of ['puppeteer', 'selenium', 'playwright']) {
  for (const destination of ['http://app.test/', 'http://api:3000/', 'malformed']) {
    test(`${framework} actual fill path guards ${destination === 'http://app.test/' ? 'allowed' : 'rejected'} origin`, async () => {
      let calls = 0;
      const enter = async (): Promise<void> => { calls++; };
      let operation: () => Promise<void>;
      if (framework === 'puppeteer') {
        const page = { setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, url: () => destination,
          keyboard: { down: async () => {}, up: async () => {}, press: async () => {}, type: enter } };
        const ui = new PuppeteerUI(page as unknown as Page, 1);
        ui.click = async () => {};
        operation = () => ui.fill('Password', 'synthetic-password', true);
      } else if (framework === 'selenium') {
        const ui = new SeleniumUI({ getCurrentUrl: async () => destination } as unknown as WebDriver, 1);
        ui.ready = async () => ({ clear: async () => {}, sendKeys: enter }) as unknown as WebElement;
        operation = () => ui.fill('Password', 'synthetic-password', true);
      } else {
        const page = { url: () => destination, getByLabel: () => ({ fill: enter }) };
        operation = () => fillSignInCredentials(page, 'reader@acceptance.test', 'synthetic-password');
      }
      if (destination === 'http://app.test/') {
        await operation();
        assert.equal(calls, framework === 'playwright' ? 2 : 1);
      } else {
        await assert.rejects(operation(), { message: 'Credential destination rejected' });
        assert.equal(calls, 0);
      }
    });
  }
}

test('Playwright actual credential sequence rechecks after email changes origin', async () => {
  let destination = 'http://app.test/';
  let calls = 0;
  const page = { url: () => destination, getByLabel: () => ({ fill: async () => {
    calls++;
    destination = 'http://api:3000/';
  } }) };
  await assert.rejects(fillSignInCredentials(page, 'reader@acceptance.test', 'synthetic-password'),
    { message: 'Credential destination rejected' });
  assert.equal(calls, 1);
});
