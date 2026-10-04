import { envelopeSchema, type SendEnvelope, type SendOutcome, type SendProvider } from './ports'

// AIDEV-NOTE: Durable fake receipts survive Worker restarts so unknown reconciliation tests exercise real persistence.
export class DurableFakeProvider implements SendProvider {
  constructor(private readonly db: D1Database, private readonly scenario: 'accept' | 'reject' | 'ambiguous' = 'accept') {}
  async send(input: SendEnvelope): Promise<SendOutcome> {
    const e = envelopeSchema.parse(input)
    if (this.scenario === 'reject') return { status: 'rejected', code: 'fake_rejected' }
    await this.db.prepare(`INSERT INTO fake_provider_receipts(owner,id,revision,provider_id) VALUES(?,?,?,?)
      ON CONFLICT(owner,id) DO NOTHING`).bind(e.owner, e.id, e.revision, `fake_${e.id}`).run()
    return this.scenario === 'ambiguous' ? { status: 'unknown' } : await this.reconcile(e)
  }
  async reconcile(input: SendEnvelope): Promise<SendOutcome> {
    const e = envelopeSchema.parse(input)
    const row = await this.db.prepare('SELECT revision,provider_id FROM fake_provider_receipts WHERE owner=? AND id=?')
      .bind(e.owner, e.id).first<{ revision: string; provider_id: string }>()
    return row?.revision === e.revision ? { status: 'accepted', providerId: row.provider_id } : { status: 'unknown' }
  }
}
