import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSeed } from '@/data/seed'
import { useData } from '@/data/store'
import type { Draft } from '@/domain/schema'
import { Composer } from './Composer'

const draft = (over: Partial<Draft> = {}): Draft => ({ id: 'd-ui', identityId: 'lachlan@boltloop.co', to: [], cc: [], bcc: [], subject: '', body: '', attachments: [], campaignId: null, threadId: null, banner: false, updatedAt: new Date().toISOString(), ...over })

beforeEach(() => useData.getState().replaceAll(createSeed(Date.now())))

describe('Composer', () => {
  it('lists the missing required fields and does not send', async () => {
    const before = useData.getState().threads.length
    render(<Composer initial={draft()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Simulate send' }))
    const problems = within(screen.getByRole('alert')).getAllByRole('listitem').map((li) => li.textContent)
    expect(problems).toEqual(['Add at least one recipient.', 'Add a subject.', 'Write a message.'])
    expect(useData.getState().threads).toHaveLength(before)
  })

  it('blocks a campaign email to an unsubscribed contact', async () => {
    const unsubscribed = useData.getState().contacts.find((c) => c.subscription === 'unsubscribed')!
    const before = useData.getState().threads.length
    render(<Composer initial={draft({ to: [unsubscribed.email], subject: 'Offer', body: 'Hello', campaignId: 'cmp-boltloop-audit' })} />)
    // Campaign-linked messages always show the unsubscribe footer.
    expect(screen.getByText('Unsubscribe')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Simulate send' }))
    expect(screen.getByRole('alert')).toHaveTextContent('is unsubscribed and cannot receive campaign emails')
    expect(useData.getState().threads).toHaveLength(before)
  })

  it('keeps a prefilled message as a draft when it is closed without being edited', async () => {
    render(<Composer initial={draft({ to: ['amara@northwind.example'], subject: 'Re: Audit scope' })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save draft and close' }))
    expect(useData.getState().drafts.find((d) => d.id === 'd-ui')).toMatchObject({ subject: 'Re: Audit scope' })
  })

  it('saves the draft when Escape closes the composer', async () => {
    render(<Composer initial={draft()} />)
    await userEvent.type(screen.getByLabelText('Subject'), 'Quarterly plan{Escape}')
    expect(useData.getState().drafts.find((d) => d.id === 'd-ui')?.subject).toBe('Quarterly plan')
  })

  it('does not keep an empty message when closed', async () => {
    render(<Composer initial={draft()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save draft and close' }))
    expect(useData.getState().drafts.some((d) => d.id === 'd-ui')).toBe(false)
  })

  it('shows only the selected brand banner and resets it when the sender changes', async () => {
    useData.getState().updateIdentity('lachlan@elevateoco.com', { banner: true })
    render(<Composer initial={draft()} />)
    expect(screen.queryByText(/Elevateo — leadership/)).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('From'), 'lachlan@elevateoco.com')
    expect(screen.getByText(/Elevateo — leadership/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('From'), 'lachlan@flooda.co')
    expect(screen.queryByText(/Elevateo — leadership/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Flooda — flood-risk/)).not.toBeInTheDocument()
  })
})
