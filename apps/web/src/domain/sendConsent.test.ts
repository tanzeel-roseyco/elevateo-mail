import { describe, expect, it } from 'vitest'
import { CONSENT_REQUIRED_REASON, consentGate, validateLeadIntake } from './sendConsent'

describe('consentGate', () => {
  it('allows resend when every recipient has consent evidence', () => {
    expect(consentGate('resend', [{ index: 0, consent_evidence: true }, { index: 1, consent_evidence: true }])).toEqual({ allowed: true })
  })
  it('denies resend and names each recipient without consent evidence', () => {
    expect(consentGate('resend', [{ index: 0, consent_evidence: true }, { index: 1, consent_evidence: false }, { index: 2, consent_evidence: false }]))
      .toEqual({ allowed: false, reason: CONSENT_REQUIRED_REASON, recipientIndexes: [1, 2] })
  })
  it.each(['mailpit', 'held'] as const)('allows %s even without consent evidence', (mode) => {
    expect(consentGate(mode, [{ index: 0, consent_evidence: false }])).toEqual({ allowed: true })
  })
  it('leaves an empty recipient list to the readiness checks', () => {
    expect(consentGate('resend', [])).toEqual({ allowed: true })
  })
})

describe('validateLeadIntake', () => {
  it('accepts an email with a consent source and normalises both', () => {
    expect(validateLeadIntake({ email: ' Person@Example.test ', consentSource: ' Inbound enquiry form ' }))
      .toEqual({ ok: true, email: 'person@example.test', consentSource: 'Inbound enquiry form' })
  })
  it.each(['', '   '])('rejects a missing consent source %j', (consentSource) => {
    expect(validateLeadIntake({ email: 'person@example.test', consentSource })).toMatchObject({ ok: false, field: 'consent_source' })
  })
  it('rejects an oversized or control-character consent source', () => {
    expect(validateLeadIntake({ email: 'person@example.test', consentSource: 'x'.repeat(201) })).toMatchObject({ ok: false, field: 'consent_source' })
    expect(validateLeadIntake({ email: 'person@example.test', consentSource: 'form\u0007' })).toMatchObject({ ok: false, field: 'consent_source' })
  })
  it('rejects an invalid email before checking consent', () => {
    expect(validateLeadIntake({ email: 'not-an-email', consentSource: '' })).toMatchObject({ ok: false, field: 'email' })
  })
})
