import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopHost } from '@/features/assistant/bridge'
import { reportDesktopBusy, resetDesktopHostForTests, useDesktopReady, useDesktopSignOut, useDesktopUpdateNotice } from './desktopHost'

function fakeHost(invoke: DesktopHost['invoke'] = vi.fn(async () => undefined)): DesktopHost {
  return { desktop: true, platform: 'macos', version: '1.0.0', invoke, listen: vi.fn(async () => () => undefined) }
}

describe('desktop host busy/ready reporting', () => {
  beforeEach(() => { resetDesktopHostForTests(); vi.restoreAllMocks() })

  it('reports incomplete until both busy sources speak, then de-duplicates unchanged values', () => {
    const host = fakeHost()
    reportDesktopBusy('unsavedDraft', true, host)
    reportDesktopBusy('unsavedDraft', true, host)
    reportDesktopBusy('sendInProgress', false, host)
    expect(host.invoke).toHaveBeenCalledTimes(2)
    expect(host.invoke).toHaveBeenNthCalledWith(1, 'host_report_busy', { unsavedDraft: true, sendInProgress: false, complete: false })
    expect(host.invoke).toHaveBeenNthCalledWith(2, 'host_report_busy', { unsavedDraft: true, sendInProgress: false, complete: true })
  })

  it('logs a failed busy report instead of swallowing it (updates stay blocked host-side)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    reportDesktopBusy('unsavedDraft', false, fakeHost(vi.fn(async () => { throw new Error('ipc down') })))
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Desktop busy report failed; updates stay blocked.', expect.any(Error)))
  })

  it('withholds readiness while the session is loading and is a no-op in a browser', () => {
    const host = fakeHost()
    const { rerender } = renderHook(({ enabled }) => useDesktopReady(enabled, host), { initialProps: { enabled: false } })
    expect(host.invoke).not.toHaveBeenCalled()
    rerender({ enabled: true })
    expect(host.invoke).toHaveBeenCalledWith('host_ready')
    expect(() => renderHook(() => useDesktopReady(true, null))).not.toThrow()
    reportDesktopBusy('unsavedDraft', true, null)
  })

  it('runs the web sign-out when the native menu fires and detaches on unmount', async () => {
    // A holder, not a `let`: TS would narrow a closure-assigned `let` to null at the call sites.
    const captured: { fire?: (payload: unknown) => void } = {}
    const stop = vi.fn()
    const host = { ...fakeHost(), listen: vi.fn(async (_event: string, callback: (payload: unknown) => void) => { captured.fire = callback; return stop }) }
    const signOut = vi.fn()
    const { unmount } = renderHook(() => useDesktopSignOut(signOut, host))
    await vi.waitFor(() => expect(captured.fire).toBeDefined())
    expect(host.listen).toHaveBeenCalledWith('host://sign-out', expect.any(Function))
    captured.fire!(null)
    expect(signOut).toHaveBeenCalledTimes(1)
    unmount()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('shows a valid native update status and reports (not renders) a malformed one', async () => {
    // A holder, not a `let`: TS would narrow a closure-assigned `let` to null at the call sites.
    const captured: { fire?: (payload: unknown) => void } = {}
    const host = { ...fakeHost(), listen: vi.fn(async (_event: string, callback: (payload: unknown) => void) => { captured.fire = callback; return () => undefined }) }
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useDesktopUpdateNotice(host))
    await vi.waitFor(() => expect(captured.fire).toBeDefined())
    expect(host.listen).toHaveBeenCalledWith('host://update', expect.any(Function))
    act(() => captured.fire!({ status: 'blocked_busy', message: 'Finish the draft first.' }))
    expect(result.current).toEqual({ status: 'blocked_busy', message: 'Finish the draft first.' })
    act(() => captured.fire!({ status: 'exploded', message: '<b>x</b>' }))
    expect(result.current?.status).toBe('blocked_busy')
    expect(error).toHaveBeenCalledWith('Desktop update status had an unexpected shape.', expect.anything())
  })
})
