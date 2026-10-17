import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { actorAliases } from '../shared/schema.js';
import { browserName, draftReceipt, parseCredentials } from './boundaries.js';

// AIDEV-NOTE: Synthetic values only; regression failures must never print real mounted credentials.
const fixture = () => ({ schema_version: 1,
  passwords: Object.fromEntries(actorAliases.map(alias => [alias, 'synthetic-password'])) });
test('credentials accept all nine aliases and preserve exact strings', () => {
  assert.equal(parseCredentials(fixture()).passwords.composer, 'synthetic-password');
});
test('credentials reject absent, extra, empty, short and oversized values with fixed errors', () => {
  for (const value of [null, {}, { ...fixture(), extra: true },
    ...['', 'short', ' '.repeat(12), 'x'.repeat(257)].map(password =>
      ({ ...fixture(), passwords: { ...fixture().passwords, reader: password } }))]) {
    assert.throws(() => parseCredentials(value), { message: 'Invalid acceptance credentials' });
  }
  const missing = fixture();
  delete missing.passwords.reader;
  assert.throws(() => parseCredentials(missing), { message: 'Invalid acceptance credentials' });
});
test('browser accepts exactly the frozen enum and default', () => {
  assert.equal(browserName(undefined), 'chromium');
  for (const name of ['chromium', 'firefox', 'webkit']) assert.equal(browserName(name), name);
  for (const name of ['', 'CHROMIUM', 'firefox ', 'http://elsewhere.test'])
    assert.throws(() => browserName(name), { message: 'Invalid acceptance browser' });
});
test('draft receipt rejects malformed, non-JSON-shaped and non-editable receipts', () => {
  const receipt = { draft_id: 'a9ab2708-8c37-4b5a-8b96-7fb3fed77b78',
    operation_id: '1c1cf4cb-8d48-4c57-bca8-333337411528', version: 1, state: 'editable' };
  assert.equal(draftReceipt(receipt).version, 1);
  for (const value of [null, '<html>SPA</html>', { ...receipt, version: 0 },
    { ...receipt, state: 'consumed' }, { ...receipt, extra: 'unexpected' }])
    assert.throws(() => draftReceipt(value), { message: 'Invalid draft receipt' });
});
