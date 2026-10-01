import type { ActivityEvent, Thread } from '@/domain/schema'

// AIDEV-NOTE: Link targets shared by search, notifications, overview, and activity. Routes are defined in app/App.tsx.

/** A conversation opens in the folder it lives in, so closing it returns to a list that contains it. */
export function threadHref(thread: Pick<Thread, 'id' | 'folder'>): string {
  return `/mail/${thread.folder}/${thread.id}`
}

/** Where an activity event leads: its conversation if it has one, else its campaign, else the activity list. */
export function eventHref(event: ActivityEvent, threads: Thread[]): string {
  if (event.threadId) {
    const thread = threads.find((t) => t.id === event.threadId)
    // A deleted conversation still links to Mail, which explains that it no longer exists.
    return thread ? threadHref(thread) : `/mail/inbox/${event.threadId}`
  }
  if (event.campaignId) return `/campaigns/${event.campaignId}/activity`
  return '/activity'
}
