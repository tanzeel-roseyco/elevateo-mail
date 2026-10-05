// AIDEV-NOTE: Expire only short-lived credentials; delivery evidence and suppression history are never purged here.
export async function cleanupExpired(db: D1Database, now: number): Promise<void> {
  const keys = { native_draft_tickets: 'ticket_hash', connection_oauth: 'state_hash',
    app_login: 'state_hash', sessions: 'token_hash' } as const
  await db.batch(Object.entries(keys).map(([table, key]) => db.prepare(
    `DELETE FROM ${table} WHERE ${key} IN (SELECT ${key} FROM ${table} WHERE expires_at<=? ORDER BY expires_at LIMIT 100)`
  ).bind(now)))
}

export type JobName = 'dispatch' | 'inbox' | 'cleanup'
export async function trackedJob(db: D1Database, name: JobName, job: () => Promise<void>,
  clock: () => number = Date.now): Promise<void> {
  const started = clock(), run = crypto.randomUUID()
  // AIDEV-NOTE: Overlapping older runs cannot overwrite the newest run's status, including same-millisecond starts.
  await db.prepare(`INSERT INTO job_health(name,started_at,run_id) VALUES(?,?,?)
    ON CONFLICT(name) DO UPDATE SET started_at=excluded.started_at,run_id=excluded.run_id,finished_at=NULL,failed=0
    WHERE excluded.started_at>=job_health.started_at`).bind(name, started, run).run()
  try {
    await job()
  } catch (error) {
    await db.prepare('UPDATE job_health SET finished_at=?,failed=1 WHERE name=? AND run_id=?')
      .bind(clock(), name, run).run()
    throw error
  }
  const finished = clock()
  await db.prepare('UPDATE job_health SET finished_at=?,last_success_at=?,failed=0 WHERE name=? AND run_id=?')
    .bind(finished, finished, name, run).run()
}

export async function jobHealth(db: D1Database, now: number) {
  const rows = await db.prepare('SELECT name,started_at,finished_at,last_success_at,failed FROM job_health')
    .all<{ name: JobName; started_at: number; finished_at: number | null; last_success_at: number | null; failed: number }>()
  return (['dispatch', 'inbox', 'cleanup'] as const).map(name => {
    const row = rows.results.find(item => item.name === name)
    return { name, lastSuccessAt: row?.last_success_at ?? null,
      status: !row ? 'not_started' : row.failed ? 'failed' :
        now - (row.finished_at ?? row.started_at) > 180_000 ? 'late' : row.finished_at === null ? 'running' : 'healthy' }
  })
}
