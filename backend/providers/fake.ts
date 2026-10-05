import { envelopeSchema, type SendEnvelope, type SendOutcome, type SendProvider } from './ports';

// AIDEV-NOTE: Instance-scoped deterministic receipts simulate acceptance without any network or real messages.
export class FakeProvider implements SendProvider {
  readonly calls: SendEnvelope[] = [];
  private readonly receipts = new Map<string, { revision: string; outcome: SendOutcome }>();
  constructor(private readonly scenario: 'accept' | 'reject' | 'ambiguous' = 'accept') {}
  async send(input: SendEnvelope): Promise<SendOutcome> {
    const e = envelopeSchema.parse(input);
    const key = `${e.owner}:${e.id}`;
    const prior = this.receipts.get(key);
    if (prior) return prior.revision === e.revision ? prior.outcome : { status: 'rejected', code: 'idempotency_conflict' };
    this.calls.push(structuredClone(e));
    const outcome: SendOutcome = this.scenario === 'reject' ? { status: 'rejected', code: 'fake_rejected' }
      : { status: 'accepted', providerId: `fake_${e.id}` };
    this.receipts.set(key, { revision: e.revision, outcome });
    return this.scenario === 'ambiguous' ? { status: 'unknown' } : outcome;
  }
  async reconcile(e: SendEnvelope): Promise<SendOutcome> {
    envelopeSchema.parse(e);
    const receipt = this.receipts.get(`${e.owner}:${e.id}`);
    return receipt?.revision === e.revision ? receipt.outcome : { status: 'unknown' };
  }
}
