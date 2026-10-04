import { SendLedger } from './ledger'

// AIDEV-NOTE: Call before starting restored consumers; snapshot pause state is never trusted.
export async function prepareRestoredDatabase(db: D1Database, now: number): Promise<void> {
  await db.prepare('INSERT INTO runtime_controls(id,dispatch_paused) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET dispatch_paused=1').run()
  // All old in-flight claims are uncertain, including claims younger than the normal crash timeout.
  await db.prepare("UPDATE send_intents SET status='unknown',updated_at=? WHERE status='dispatching'").bind(now).run()
  await new SendLedger(db).recover(now)
}
