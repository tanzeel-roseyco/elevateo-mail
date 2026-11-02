// MessageRow is memoised with id-based callbacks so list pages can pass stable handlers; these
// tests pin that contract: an unrelated parent commit re-renders no unchanged row, a changed row
// re-renders alone, and every control reports the thread id it belongs to.
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ThreadSummary } from '@/data/contract'
import * as format from '@/lib/format'
import { MessageRow, threadHref } from './MessageRow'

vi.mock('@/lib/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/format')>()
  // formatWhen runs exactly once per row render, so its call count is the row render count.
  return { ...actual, formatWhen: vi.fn(actual.formatWhen) }
})

const MB = '00000000-0000-4000-8000-000000000021'

function thread(id: string, unread = false): ThreadSummary {
  return {
    id,
    mailbox_id: MB,
    subject: `Subject ${id}`,
    subject_truncated: false,
    sender: { display_name: 'Ada', address: 'ada@example.com' },
    preview_text: '',
    last_message_at: '2026-10-12T00:00:00Z',
    unread,
    message_count: 1,
    folder: 'inbox',
    snoozed_until: null,
    starred: false,
  }
}

const formatWhen = vi.mocked(format.formatWhen)
const rowRenders = () => formatWhen.mock.calls.length

afterEach(() => {
  cleanup()
  formatWhen.mockClear()
})

describe('MessageRow memoisation', () => {
  it('does not re-render unchanged rows when the parent commits unrelated state', () => {
    const onStar = vi.fn()
    function List() {
      const [tick, setTick] = useState(0)
      const [rows, setRows] = useState([thread('a'), thread('b')])
      return (
        <>
          <button onClick={() => setTick(tick + 1)}>tick {tick}</button>
          <button onClick={() => setRows((prev) => [{ ...prev[0]!, unread: true }, prev[1]!])}>change a</button>
          <ul>
            {rows.map((row) => <MessageRow key={row.id} thread={row} mailboxId={MB} filter="all" selected={false} onStar={onStar} />)}
          </ul>
        </>
      )
    }
    render(<MemoryRouter><List /></MemoryRouter>)
    expect(rowRenders()).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'tick 0' }))
    expect(screen.getByRole('button', { name: 'tick 1' })).toBeTruthy()
    expect(rowRenders()).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'change a' }))
    expect(rowRenders()).toBe(3)
    expect(screen.getByText('Unread,')).toBeTruthy()
  })

  it('reports the thread id to every id-based handler', () => {
    const onSelect = vi.fn()
    const onStar = vi.fn()
    const onToggleRead = vi.fn()
    render(
      <MemoryRouter>
        <ul><MessageRow thread={thread('a', true)} selected={false} onSelect={onSelect} onStar={onStar} onToggleRead={onToggleRead} /></ul>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Subject a from Ada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Star Subject a from Ada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark Subject a from Ada as read' }))
    expect(onSelect).toHaveBeenCalledWith('a', true)
    expect(onStar).toHaveBeenCalledWith('a')
    expect(onToggleRead).toHaveBeenCalledWith('a')
  })

  it('derives the conversation link from the thread, the route mailbox and the non-default view', () => {
    render(
      <MemoryRouter>
        <ul>
          <MessageRow thread={thread('a')} selected={false} />
          <MessageRow thread={thread('b')} mailboxId="route-mailbox" filter="unread" selected={false} />
        </ul>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Subject a/ }).getAttribute('href')).toBe(`/mailboxes/${MB}/threads/a`)
    expect(screen.getByRole('link', { name: /Subject b/ }).getAttribute('href')).toBe('/mailboxes/route-mailbox/threads/b?filter=unread')
    expect(threadHref(MB, 'c', 'all')).toBe(`/mailboxes/${MB}/threads/c`)
  })
})
