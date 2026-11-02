import { useState } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ThreadSummary } from '@/data/contract'
import { useRowHandlers, type RowHandlers, type RowOps } from './useRowHandlers'

const MB = '00000000-0000-4000-8000-000000000021'
const thread = (id: string, starred = false): ThreadSummary => ({
  id, mailbox_id: MB, subject: id, subject_truncated: false, sender: null, preview_text: '', last_message_at: null,
  unread: true, message_count: 1, folder: 'inbox', snoozed_until: null, starred,
})

afterEach(cleanup)

function harness() {
  const star = vi.fn(async () => undefined)
  const begin = vi.fn()
  const ops = { begin, star, setRead: vi.fn(async () => undefined), move: vi.fn(async () => undefined), snooze: vi.fn(async () => undefined) }
  let setRows: (rows: ThreadSummary[]) => void = () => {}
  const handlers: RowHandlers[] = []
  function Host() {
    const [visible, set] = useState<ThreadSummary[]>([thread('a')])
    setRows = set
    const current: RowOps = { visible, ...ops }
    handlers.push(useRowHandlers(current))
    return null
  }
  render(<Host />)
  return { ops, handlers, setRows: (rows: ThreadSummary[]) => act(() => setRows(rows)) }
}

describe('useRowHandlers', () => {
  it('keeps handler identity across renders and acts on the latest thread object', () => {
    const { ops, handlers, setRows } = harness()
    const starredA = thread('a', true)
    setRows([starredA, thread('b')])
    expect(handlers.length).toBeGreaterThan(1)
    expect(handlers[0]).toBe(handlers[handlers.length - 1])
    handlers[0]?.onStar('a')
    expect(ops.begin).toHaveBeenCalledTimes(1)
    expect(ops.star).toHaveBeenCalledWith(starredA)
  })

  it('ignores an action for a thread that already left the view', () => {
    const { ops, handlers, setRows } = harness()
    setRows([])
    handlers[0]?.onStar('a')
    handlers[0]?.onToggleRead('a')
    expect(ops.begin).not.toHaveBeenCalled()
    expect(ops.star).not.toHaveBeenCalled()
    expect(ops.setRead).not.toHaveBeenCalled()
  })
})
