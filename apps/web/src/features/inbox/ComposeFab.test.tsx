import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { ComposeFab } from './FolderNav'

async function mailboxFixture() {
  const page = await createFixtureGateway().listMailboxes(
    { contextId: 'context_A_0123456789', authorizationVersion: 'authz_A_0123456789' }, {},
  )
  const mailbox = page.items.find((item) => item.capabilities.compose)
  if (!mailbox) throw new Error('Missing compose-capable fixture')
  return mailbox
}

describe('mobile compose action', () => {
  it.each(['', '/drafts', '/drafts/'])('remains available on mailbox route %s', async (suffix) => {
    const mailbox = await mailboxFixture()
    render(<MemoryRouter initialEntries={[`/mailboxes/${mailbox.id}${suffix}`]}><ComposeFab mailboxId={mailbox.id} mailbox={mailbox} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Compose a new draft' })).toBeTruthy()
  })

  it.each(['/drafts/new', '/drafts/existing', '/drafts/existing/send-review'])('does not cover draft controls on %s', async (suffix) => {
    const mailbox = await mailboxFixture()
    render(<MemoryRouter initialEntries={[`/mailboxes/${mailbox.id}${suffix}`]}><ComposeFab mailboxId={mailbox.id} mailbox={mailbox} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Compose a new draft' })).toBeNull()
  })

  it('stays absent when mailbox capabilities are unavailable', () => {
    render(<MemoryRouter><ComposeFab mailboxId="unknown" mailbox={undefined} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Compose a new draft' })).toBeNull()
  })
})
