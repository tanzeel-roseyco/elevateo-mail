import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixture'
import { createResendRuntime } from '../resendConfig'
import { base64url } from '../credentialVault'

// AIDEV-NOTE: Configuration has no user API key and cannot silently activate sending.
test('Resend connection configuration is opt-in, canonical and redacts invalid secret configuration', async () => {
  const f = await fixture()
  try {
    const fetcher = async (): Promise<Response> => { throw new Error('must not call network') }
    assert.equal(await createResendRuntime(f.env.DB, {}, fetcher), undefined)
    assert.equal(await createResendRuntime(f.env.DB, { RESEND_CONNECTIONS_ENABLED: 'false' }, fetcher), undefined)
    for (const env of [{ RESEND_CONNECTIONS_ENABLED: 'yes' }, { RESEND_CONNECTIONS_ENABLED: 'true' },
      { RESEND_CONNECTIONS_ENABLED: 'true', RESEND_ENCRYPTION_KEY: 'secret' },
      { RESEND_CONNECTIONS_ENABLED: 'true', RESEND_ENCRYPTION_KEY: 'A'.repeat(42) + 'B' }]) {
      await assert.rejects(createResendRuntime(f.env.DB, env, fetcher), { code: 'resend_configuration_invalid' })
    }
    assert.ok(await createResendRuntime(f.env.DB, { RESEND_CONNECTIONS_ENABLED: 'true',
      RESEND_ENCRYPTION_KEY: base64url(new Uint8Array(32)) }, fetcher))
  } finally { await f.close() }
})
