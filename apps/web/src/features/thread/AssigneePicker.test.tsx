import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MailboxAssigneeOptionPage } from '@/data/v2Contract'
import type { ReadContext } from '@/data/gateway'
import { AssigneePicker } from './AssigneePicker'

const actor = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const mailboxA = '33333333-3333-4333-8333-333333333333'
const mailboxB = '44444444-4444-4444-8444-444444444444'
const context: ReadContext = { contextId: 'context_0123456789', authorizationVersion: 'version_0123456789' }
const session = {
  status: 'ready', session: {
    actor: { id: actor }, organization: { id: '55555555-5555-4555-8555-555555555555' },
    context_id: context.contextId, authorization_version: context.authorizationVersion,
  },
}
const { list, feature } = vi.hoisted(() => ({ list: vi.fn(), feature: { enabled: true } }))

vi.mock('@/app/session', () => ({ useSession: () => ({ state: session }) }))
vi.mock('@/app/protectedRequest', () => ({
  useProtectedRequest: () => ({ request: async <T,>(work: (ctx: ReadContext, signal: AbortSignal) => Promise<T>) => {
    try { return { kind: 'ok' as const, value: await work(context, new AbortController().signal) } }
    catch (error) { return { kind: 'failed' as const, error } }
  } }),
}))
vi.mock('@/app/featureGateways', () => ({ useFeatureGateways: () => ({
  assigneeOptions: feature.enabled ? { listMailboxAssigneeOptions: list } : undefined,
}) }))

function page(mailboxId: string, users: string[], nextCursor: string | null = null): MailboxAssigneeOptionPage {
  return { context_id: context.contextId, authorization_version: context.authorizationVersion,
    mailbox_id: mailboxId, items: users.map((user_id) => ({ user_id })), next_cursor: nextCursor }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  list.mockReset()
  feature.enabled = true
  context.contextId = 'context_0123456789'
  context.authorizationVersion = 'version_0123456789'
  session.session.context_id = context.contextId
  session.session.authorization_version = context.authorizationVersion
})

describe('mailbox assignee picker', () => {
  it('shows an unavailable state when the inactive port is not injected', () => {
    feature.enabled = false
    render(<AssigneePicker mailboxId={mailboxA} actorId={actor} currentAssigneeId={null} disabled={false} onAssign={vi.fn()} />)
    expect(screen.getByText('Assignee choices are unavailable.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Choose assignee' })).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })

  it('loads only when opened, pages one bounded request at a time, and selects a verified UUID', async () => {
    const onAssign = vi.fn()
    list.mockResolvedValueOnce(page(mailboxA, [actor], 'next')).mockResolvedValueOnce(page(mailboxA, [other]))
    render(<AssigneePicker mailboxId={mailboxA} actorId={actor} currentAssigneeId={null} disabled={false} onAssign={onAssign} />)
    expect(list).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Choose assignee' }))
    expect(await screen.findByRole('button', { name: 'Assign to you' })).toBeTruthy()
    expect(list).toHaveBeenCalledWith(context, mailboxA, { limit: 50 }, expect.any(AbortSignal))
    fireEvent.click(screen.getByRole('button', { name: 'Load more users' }))
    const target = await screen.findByRole('button', { name: `Assign to user ${other}` })
    expect(list).toHaveBeenCalledWith(context, mailboxA, { cursor: 'next', limit: 50 }, expect.any(AbortSignal))
    fireEvent.click(target)
    expect(onAssign).toHaveBeenCalledExactlyOnceWith(other)
  })

  it('reports an unavailable directory and offers retry without invented choices', async () => {
    list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(mailboxA, []))
    render(<AssigneePicker mailboxId={mailboxA} actorId={actor} currentAssigneeId={other} disabled={false} onAssign={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose assignee' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: `Assign to user ${other}` })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try assignee choices again' }))
    expect(await screen.findByText('No eligible users were returned.')).toBeTruthy()
  })

  it('aborts a pending old mailbox read and ignores its late reply', async () => {
    const oldRead = deferred<MailboxAssigneeOptionPage>()
    const signals: AbortSignal[] = []
    list.mockImplementationOnce((_ctx, _id, _query, signal) => {
      signals.push(signal)
      return oldRead.promise
    }).mockResolvedValueOnce(page(mailboxB, [other]))
    const onAssign = vi.fn()
    const view = render(<AssigneePicker mailboxId={mailboxA} actorId={actor} currentAssigneeId={null} disabled={false} onAssign={onAssign} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose assignee' }))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    view.rerender(<AssigneePicker mailboxId={mailboxB} actorId={actor} currentAssigneeId={null} disabled={false} onAssign={onAssign} />)
    await waitFor(() => expect(signals[0]?.aborted).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Choose assignee' }))
    expect(await screen.findByRole('button', { name: `Assign to user ${other}` })).toBeTruthy()
    oldRead.resolve(page(mailboxA, [actor]))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Assign to you' })).toBeNull())
    expect(onAssign).not.toHaveBeenCalled()
  })

  it('aborts a pending old authorization context and cannot show its late options', async () => {
    const oldRead = deferred<MailboxAssigneeOptionPage>()
    let oldSignal: AbortSignal | undefined
    const oldPage = page(mailboxA, [actor])
    list.mockImplementationOnce((_ctx, _id, _query, signal) => {
      oldSignal = signal
      return oldRead.promise
    }).mockResolvedValueOnce({ ...oldPage, context_id: 'context_9876543210',
      authorization_version: 'version_9876543210', items: [{ user_id: other }] })
    const view = render(<AssigneePicker mailboxId={mailboxA} actorId={actor} currentAssigneeId={null} disabled={false} onAssign={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose assignee' }))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    context.contextId = 'context_9876543210'
    context.authorizationVersion = 'version_9876543210'
    session.session.context_id = context.contextId
    session.session.authorization_version = context.authorizationVersion
    view.rerender(<AssigneePicker mailboxId={mailboxA} actorId={actor} currentAssigneeId={null} disabled={false} onAssign={vi.fn()} />)
    await waitFor(() => expect(oldSignal?.aborted).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Choose assignee' }))
    expect(await screen.findByRole('button', { name: `Assign to user ${other}` })).toBeTruthy()
    oldRead.resolve(oldPage)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Assign to you' })).toBeNull())
    context.contextId = 'context_0123456789'
    context.authorizationVersion = 'version_0123456789'
    session.session.context_id = context.contextId
    session.session.authorization_version = context.authorizationVersion
  })
})
