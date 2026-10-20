// Per-device stars: scoped by actor/organization/mailbox, validated on read, tolerant of blocked
// or corrupt storage. The store never claims server persistence, so these tests only cover the
// browser boundary.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStarCache, useStarStore } from './starStore'

const scope = { actorId: 'actor-a', organizationId: 'org-a', mailboxId: 'mailbox-a' }
const THREAD = '00000000-0000-4000-8000-000000000101'
const OTHER = '00000000-0000-4000-8000-000000000102'
const KEY = 'elevateo.inbox.starred.actor-a.org-a.mailbox-a'

beforeEach(() => {
  window.localStorage.clear()
  resetStarCache()
})
afterEach(() => {
  window.localStorage.clear()
  resetStarCache()
})

describe('useStarStore', () => {
  it('toggles a star on and off and persists it for the same scope (happy path)', () => {
    const { result } = renderHook(() => useStarStore(scope))
    expect(result.current.isStarred(THREAD)).toBe(false)
    act(() => result.current.toggle(THREAD))
    expect(result.current.isStarred(THREAD)).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual([THREAD])
    const again = renderHook(() => useStarStore(scope))
    expect(again.result.current.starred.has(THREAD)).toBe(true)
    act(() => again.result.current.toggle(THREAD))
    expect(again.result.current.isStarred(THREAD)).toBe(false)
  })

  it('keeps stars separate per mailbox and ignores writes without a scope', () => {
    const { result } = renderHook(() => useStarStore(scope))
    act(() => result.current.toggle(THREAD))
    const other = renderHook(() => useStarStore({ ...scope, mailboxId: 'mailbox-b' }))
    expect(other.result.current.isStarred(THREAD)).toBe(false)
    const unscoped = renderHook(() => useStarStore(null))
    act(() => unscoped.result.current.toggle(OTHER))
    expect(unscoped.result.current.starred.size).toBe(0)
    expect(window.localStorage.length).toBe(1)
  })

  it('treats corrupt or foreign stored values as an empty set instead of trusting them', () => {
    window.localStorage.setItem(KEY, JSON.stringify(['not-a-uuid', 42]))
    const { result } = renderHook(() => useStarStore(scope))
    expect(result.current.starred.size).toBe(0)
    window.localStorage.setItem(KEY, '{broken json')
    resetStarCache()
    const second = renderHook(() => useStarStore(scope))
    expect(second.result.current.starred.size).toBe(0)
  })

  it('picks up a star written by another tab and never overwrites it with a stale snapshot', () => {
    const { result } = renderHook(() => useStarStore(scope))
    expect(result.current.isStarred(THREAD)).toBe(false)
    // Another tab stars THREAD; the browser delivers a storage event to this tab.
    window.localStorage.setItem(KEY, JSON.stringify([THREAD]))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify([THREAD]) }))
    })
    expect(result.current.isStarred(THREAD)).toBe(true)
    act(() => result.current.toggle(OTHER))
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual([THREAD, OTHER])
  })
})
