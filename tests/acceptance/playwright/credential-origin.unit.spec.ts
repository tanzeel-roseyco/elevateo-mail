import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { atCredentialOrigin } from './credential-origin.js';

// AIDEV-NOTE: Model each harness's sensitive command without reading runtime credentials or starting applications.
for (const command of ['type', 'sendKeys', 'fill']) {
  test(`${command} rejects redirected, malformed and unavailable origins before entry`, async () => {
    let calls = 0;
    const enter = async (): Promise<void> => { calls++; };
    for (const url of ['http://api:3000/login', 'http://app.test.evil/', 'https://app.test/',
      'not a URL', '', 'about:blank', 'http://user:password@app.test/']) {
      await assert.rejects(atCredentialOrigin(() => url, enter), { message: 'Credential destination rejected' });
    }
    await assert.rejects(atCredentialOrigin(() => { throw new Error('private diagnostic'); }, enter),
      { message: 'Credential destination rejected' });
    assert.equal(calls, 0);
  });
  test(`${command} rechecks destination between allowed email and rejected password operations`, async () => {
    let url = 'http://app.test/#/login';
    let calls = 0;
    const enter = async (): Promise<void> => { calls++; url = 'http://mailpit:8025/'; };
    await atCredentialOrigin(() => url, enter);
    await assert.rejects(atCredentialOrigin(() => url, enter), { message: 'Credential destination rejected' });
    assert.equal(calls, 1);
  });
}
