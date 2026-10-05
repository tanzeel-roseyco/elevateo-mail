// AIDEV-NOTE: Fixture reset clears bearer tickets and FK children before reusing session/mailbox identities.
const tables = ['resend_reply_receipts', 'resend_reply_tokens', 'hunter_credentials', 'job_health', 'native_draft_tickets', 'sequence_steps', 'campaign_sequences', 'gmail_sync',
  'gmail_send_permissions', 'connection_oauth', 'provider_credentials', 'app_login', 'app_identities',
  'fake_provider_receipts', 'event_receipts', 'event_connections', 'unsubscribe_tokens', 'send_replacements',
  'resend_event_receipts', 'resend_message_links', 'send_intents', 'resend_senders', 'resend_credentials',
  'campaign_stops', 'campaigns', 'messages', 'suppressions', 'contacts', 'mailboxes', 'sessions'] as const

export async function resetFixtureRows(db: D1Database): Promise<void> {
  for (const table of tables) await db.prepare(`DELETE FROM ${table}`).run()
}
