import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSeed } from '@/data/seed'
import { useData } from '@/data/store'
import { Toaster } from '@/ui/toast'
import { MailPage } from './MailPage'

const INVOICE = 'Invoice INV-2041 for the September retainer'
const AGREEMENT = 'Flood model data-sharing agreement'

function renderMail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mail/:folder/:threadId?" element={<MailPage />} />
      </Routes>
      <Toaster />
    </MemoryRouter>,
  )
}

const folderOf = (subject: string) => useData.getState().threads.find((t) => t.subject === subject)!.folder

beforeEach(() => useData.getState().replaceAll(createSeed(Date.now())))

describe('MailPage', () => {
  it('archives the selected conversations and restores them with Undo', async () => {
    renderMail('/mail/inbox?campaign=none')
    await userEvent.click(screen.getByRole('checkbox', { name: `Select conversation: ${INVOICE}` }))
    await userEvent.click(screen.getByRole('checkbox', { name: `Select conversation: ${AGREEMENT}` }))
    await userEvent.click(within(screen.getByRole('toolbar', { name: 'Bulk actions' })).getByRole('button', { name: 'Archive' }))

    expect(folderOf(INVOICE)).toBe('archive')
    expect(folderOf(AGREEMENT)).toBe('archive')
    expect(screen.queryByRole('checkbox', { name: `Select conversation: ${INVOICE}` })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(folderOf(INVOICE)).toBe('inbox')
    expect(folderOf(AGREEMENT)).toBe('inbox')
  })

  it('does not show a conversation under a folder it is no longer in, and links to where it is', () => {
    const moved = useData.getState().threads.find((t) => t.subject === INVOICE)!
    useData.getState().patchThreads([moved.id], { folder: 'archive' })
    renderMail(`/mail/inbox/${moved.id}`)
    expect(screen.getByText('This conversation is not in Inbox')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: INVOICE })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open it in Archive' })).toHaveAttribute('href', `/mail/archive/${moved.id}`)
  })

  it('filters drafts with the search box', () => {
    const base = { identityId: 'lachlan@boltloop.co', to: [], cc: [], bcc: [], body: '', attachments: [], campaignId: null, threadId: null, banner: false, updatedAt: new Date().toISOString() }
    useData.getState().upsertDraft({ ...base, id: 'd-a', subject: 'Zebra budget review' })
    useData.getState().upsertDraft({ ...base, id: 'd-b', subject: 'Holiday rota', to: ['quentin@zebra.example'] })
    useData.getState().upsertDraft({ ...base, id: 'd-c', subject: 'Unrelated note' })
    renderMail('/mail/drafts?q=zebra')
    expect(screen.getByText('Zebra budget review')).toBeInTheDocument()
    expect(screen.getByText('Holiday rota')).toBeInTheDocument()
    expect(screen.queryByText('Unrelated note')).not.toBeInTheDocument()
  })

  it('shows an empty state, and no bulk actions, for an empty folder', () => {
    renderMail('/mail/trash')
    expect(screen.getByRole('heading', { name: 'Nothing in Trash' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('offers Clear filters when a search matches nothing', async () => {
    renderMail('/mail/inbox?q=zzzz-no-such-message')
    expect(screen.getByRole('heading', { name: 'No conversations match' })).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
    expect(screen.getByRole('checkbox', { name: `Select conversation: ${INVOICE}` })).toBeInTheDocument()
  })
})
