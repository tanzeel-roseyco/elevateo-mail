import { useSession } from '@/app/session'
import { EmptyState } from '@/ui/Async'

/** Session display only; no unsupported account or credential mutation controls. */
export function PersonalSettingsPage() {
  const { state } = useSession()
  if (state.status !== 'ready') return <EmptyState title="Personal settings unavailable" body="Your current session could not be verified." />
  return <section className="mx-auto max-w-2xl p-4" aria-label="Personal settings"><h1 className="text-xl font-semibold">Personal settings</h1><p className="mt-2 text-sm text-muted">Signed in as {state.session.actor.display_name ?? 'Unnamed user'}.</p><p className="mt-4 text-sm">Account recovery and sign-out are available from the account menu. Mailbox access follows your current memberships and server permissions.</p><p className="mt-2 text-sm text-muted">Profile editing, credentials and notification preferences are unavailable in this build.</p></section>
}
