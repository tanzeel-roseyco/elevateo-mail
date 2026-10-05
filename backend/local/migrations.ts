// AIDEV-NOTE: Offline migration DDL and its marker commit atomically; failed bootstrap remains restartable.
export async function applyMigration(db: D1Database, name: string, sql: string): Promise<void> {
  let statement = ''
  const statements: D1PreparedStatement[] = []
  // AIDEV-NOTE: Trigger bodies contain semicolons; apply complete statements, never split SQL blindly.
  for (const line of sql.split('\n')) {
    if (!line.trim() || line.trim().startsWith('--')) continue
    statement += `${line}\n`
    const trigger = statement.trim().startsWith('CREATE TRIGGER')
    const ended = line.trim() === 'END;' || (line.trim().startsWith('BEGIN ') && line.trim().endsWith('END;'))
    if (trigger ? ended : line.trim().endsWith(';')) {
      statements.push(db.prepare(statement)); statement = ''
    }
  }
  if (statement.trim()) throw new Error('Incomplete local migration')
  // AIDEV-NOTE: D1 batches roll back partial schema changes, so interruption cannot strand the local bootstrap.
  await db.batch([...statements, db.prepare('INSERT INTO local_migrations VALUES(?)').bind(name)])
}
