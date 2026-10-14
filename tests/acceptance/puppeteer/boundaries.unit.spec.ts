import test from 'node:test';
import assert from 'node:assert/strict';
import { actorAliases } from '../shared/schema.js';
import { draftIdFromURL, parseCredentials, parseSettings, verifyVersion } from './boundaries.js';

// AIDEV-NOTE: Pure synthetic boundary tests never load mounted secrets or launch browser/application processes.
const settings = { origin: 'http://app.test', executable: '/opt/chromium/chrome', version: '153.0.8010.47', uid: 1000 };
test('private exact origin, absolute executable, nonroot and bounded exact version', () => {
  assert.equal(parseSettings(settings).uid, 1000);
  for (const origin of ['http://app.test/', 'http://app.test.evil', 'http://user:pass@app.test', 'https://app.test'])
    assert.throws(() => parseSettings({ ...settings, origin }));
  for (const executable of ['', 'chrome', '/opt/chrome\0', '/opt/chrome\n'])
    assert.throws(() => parseSettings({ ...settings, executable }));
  for (const uid of [0, -1, undefined, null]) assert.throws(() => parseSettings({ ...settings, uid }));
  for (const version of ['', 'latest', '153', '153.0.8010.47\n', '153.0.8010.47 extra'])
    assert.throws(() => parseSettings({ ...settings, version }));
});
test('browser identity cannot accept prefix, suffix, or alternate version', () => {
  verifyVersion('Chrome/153.0.8010.47', settings.version);
  verifyVersion('HeadlessChrome/153.0.8010.47', settings.version);
  for (const actual of ['Chrome/153.0.8010.48', 'Firefox/153.0.8010.47', 'Chrome/153.0.8010.47\n', '153.0.8010.47'])
    assert.throws(() => verifyVersion(actual, settings.version));
});
test('strict nine-actor credential shape and password limits', () => {
  const passwords = Object.fromEntries(actorAliases.map(alias => [alias, 'synthetic-only-password']));
  assert.equal(parseCredentials({ schema_version: 1, passwords }).passwords.composer, passwords.composer);
  for (const input of [null, {}, { schema_version: 2, passwords }, { schema_version: 1, passwords, extra: true },
    { schema_version: 1, passwords: { ...passwords, extra: 'synthetic-only-password' } },
    ...[null, '', ' '.repeat(12), 'short', 'x'.repeat(257), undefined].map(composer =>
      ({ schema_version: 1, passwords: { ...passwords, composer } }))])
    assert.throws(() => parseCredentials(input), { message: 'Invalid acceptance credentials' });
});
test('draft identity rejects foreign scope, origin, credentials and URL suffixes', () => {
  const mailbox = 'a1111111-1111-4111-8111-111111111111';
  const draft = 'b1111111-1111-4111-8111-111111111111';
  const url = `http://app.test/#/mailboxes/${mailbox}/drafts/${draft}`;
  assert.equal(draftIdFromURL(url, mailbox), draft);
  assert.equal(draftIdFromURL(`${url}?new=1`, mailbox), draft);
  for (const value of [url.replace('app.test', 'evil.test'), url.replace('app.test', 'user:pass@app.test'),
    url.replace('/#', '/?token=x#'), `${url}?x`, `${url}/`, url.replace(draft, 'invalid'), url.replace(mailbox, draft),
    `${url}?new=0`, `${url}?new=1&extra=x`, `${url}?new=1?new=1`, `${url}?new=1/`, `${url}?new=1\n`])
    assert.throws(() => draftIdFromURL(value, mailbox));
});
