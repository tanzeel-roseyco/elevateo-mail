import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actorAliases } from '../shared/schema.js';
import { draftIdFromURL, gridConfig, verifyCapabilities } from './boundaries.js';
import { parseCredentials } from './credentials.js';

// AIDEV-NOTE: Synthetic values exercise trust boundaries without loading runtime secrets or launching a browser.
const env = { SELENIUM_GRID_URL: 'http://selenium:4444', SELENIUM_EXPECTED_BROWSER: 'chrome',
  SELENIUM_EXPECTED_BROWSER_VERSION: '153.0.8010.47', SELENIUM_EXPECTED_DRIVER_VERSION: '153.0.8010.47' };
test('only exact private Grid and complete version tuple accepted', () => {
  assert.equal(gridConfig(env).browser, 'chrome');
  for (const grid of ['http://selenium:4444/', 'http://selenium:4444?secret=x', 'http://user:pass@selenium:4444',
    'http://localhost:4444', 'https://selenium:4444', 'http://selenium.evil:4444']) {
    assert.throws(() => gridConfig({ ...env, SELENIUM_GRID_URL: grid }), /^Error: Invalid Selenium configuration$/);
  }
  for (const value of ['', '153', '153.0\n', 'latest', '153.0?token=x'])
    assert.throws(() => gridConfig({ ...env, SELENIUM_EXPECTED_BROWSER_VERSION: value }));
  assert.throws(() => gridConfig({ ...env, SELENIUM_EXPECTED_BROWSER: 'webkit' }));
  assert.throws(() => gridConfig({}));
});
test('negotiated browser and driver must both match; raw capabilities never escape', () => {
  const config = gridConfig(env);
  const caps: Record<string, unknown> = { browserName: 'chrome', browserVersion: '153.0.8010.47',
    chrome: { chromedriverVersion: '153.0.8010.47 (abcdef-refs/branch-heads/8010@{#1})', userDataDir: 'private' } };
  assert.equal(verifyCapabilities(config, key => caps[key]), 'W3C chrome 153.0.8010.47; driver 153.0.8010.47');
  for (const patch of [{ browserName: 'firefox' }, { browserVersion: '153.0.8010.48' },
    { chrome: null }, { chrome: { chromedriverVersion: '153.0.8010.48' } },
    { chrome: { chromedriverVersion: '153.0.8010.47?token=secret' } }]) {
    const changed: Record<string, unknown> = { ...caps, ...patch };
    assert.throws(() => verifyCapabilities(config, key => changed[key]),
      /^Error: Negotiated Selenium capabilities do not match$/);
  }
  const firefox = gridConfig({ ...env, SELENIUM_EXPECTED_BROWSER: 'firefox',
    SELENIUM_EXPECTED_BROWSER_VERSION: '140.0', SELENIUM_EXPECTED_DRIVER_VERSION: '0.36.0' });
  const gecko: Record<string, unknown> = { browserName: 'firefox', browserVersion: '140.0', 'moz:geckodriverVersion': '0.36.0' };
  assert.equal(verifyCapabilities(firefox, key => gecko[key]), 'W3C firefox 140.0; driver 0.36.0');
});
test('credential schema rejects missing, extra, blank, short and oversized secrets without echo', () => {
  const passwords = Object.fromEntries(actorAliases.map(alias => [alias, 'synthetic-unit-value']));
  assert.equal(Object.keys(parseCredentials({ schema_version: 1, passwords }).passwords).length, 9);
  for (const length of [12, 256])
    assert.equal(parseCredentials({ schema_version: 1, passwords: { ...passwords, composer: 'x'.repeat(length) } }).passwords.composer.length, length);
  for (const value of ['', ' '.repeat(12), 'x'.repeat(11), 'x'.repeat(257), null, 12])
    assert.throws(() => parseCredentials({ schema_version: 1, passwords: { ...passwords, composer: value } }),
      /^Error: Invalid acceptance credentials$/);
  assert.throws(() => parseCredentials({ schema_version: 1, passwords: {} }));
  assert.throws(() => parseCredentials({ schema_version: 1, passwords: { ...passwords, extra: 'synthetic-unit-value' } }));
  assert.throws(() => parseCredentials({ schema_version: 2, passwords }));
  assert.throws(() => parseCredentials(null));
});
test('draft route requires correct origin, mailbox and valid UUID without query leakage', () => {
  const mailbox = '10000000-0000-4000-8000-000000000001';
  const draft = '20000000-0000-4000-8000-000000000001';
  const url = `http://app.test/#/mailboxes/${mailbox}/drafts/${draft}`;
  assert.equal(draftIdFromURL(`${url}?new=1`, mailbox), draft);
  assert.equal(draftIdFromURL(url, mailbox), draft);
  for (const bad of [url.replace('app.test', 'evil.test'), url.replace('/#', '/?token=secret#'),
    `${url}?token=secret`, url.replace(draft, 'not-a-uuid'), url.replace('http://', 'http://secret@')])
    assert.throws(() => draftIdFromURL(bad, mailbox), /^Error: Invalid draft route$/);
  assert.throws(() => draftIdFromURL(url, draft));
});
