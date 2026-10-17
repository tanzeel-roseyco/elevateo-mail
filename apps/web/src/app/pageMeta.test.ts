// IA refresh: every routed screen gets a group, a purpose line and, when nested, a parent to return to.
import { describe, expect, it } from 'vitest'
import { describeRoute } from './pageMeta'

const name = (id: string) => (id === 'mbx1' ? 'Team inbox' : 'Unknown mailbox')

describe('describeRoute', () => {
  it('names the home screen as Today with no back path', () => {
    expect(describeRoute('/', name)).toMatchObject({ group: 'Home', crumb: 'Today' })
    expect(describeRoute('/', name)?.back).toBeUndefined()
  })

  it('places mailbox screens under Mail with the mailbox name', () => {
    expect(describeRoute('/mailboxes/mbx1', name)).toMatchObject({ group: 'Mail', crumb: 'Team inbox · Inbox' })
    expect(describeRoute('/mailboxes/mbx1/drafts/d2/send-review', name)).toMatchObject({ crumb: 'Team inbox · Review send' })
    // Mail detail pages render their own back link; the strip must not add a second one.
    expect(describeRoute('/mailboxes/mbx1/threads/t9', name)?.back).toBeUndefined()
    expect(describeRoute('/mailboxes/mbx1/drafts/d2', name)?.back).toBeUndefined()
  })

  it('groups outreach, contacts and settings screens and sends nested campaign pages back to their campaign', () => {
    expect(describeRoute('/outreach/campaigns/new', name)).toMatchObject({ crumb: 'New campaign', back: { to: '/outreach/campaigns' } })
    expect(describeRoute('/outreach/campaigns/c1/leads/l1', name)?.back).toEqual({ to: '/outreach/campaigns/c1', label: 'Back to campaign' })
    expect(describeRoute('/people', name)?.group).toBe('Contacts')
    expect(describeRoute('/settings/organization', name)?.group).toBe('Settings')
  })

  it('returns null for unknown or malformed paths instead of guessing', () => {
    expect(describeRoute('/nope', name)).toBeNull()
    expect(describeRoute('/mailboxes/', name)).toBeNull()
    expect(describeRoute('', name)).toBeNull()
  })
})
