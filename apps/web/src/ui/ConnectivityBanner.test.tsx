// FE-805 online-only notice: nothing while online, an honest offline notice, and after a drop
// returns an explicit reload that the person triggers (no automatic refetch, no cache claim).
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectivityBanner } from './ConnectivityBanner'

afterEach(() => vi.restoreAllMocks())

describe('connectivity banner', () => {
  it('renders nothing while online and ignores a stray online event', () => {
    const onReload = vi.fn()
    render(<ConnectivityBanner onReload={onReload} />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(screen.queryByRole('status')).toBeNull()
    expect(onReload).not.toHaveBeenCalled()
  })

  it('announces offline without any action, then offers reload once the connection returns', () => {
    const onReload = vi.fn()
    render(<ConnectivityBanner onReload={onReload} />)
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(screen.getByRole('status').textContent).toMatch(/You are offline/)
    expect(screen.queryByRole('button')).toBeNull()
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(screen.getByRole('status').textContent).toMatch(/Connection is back/)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('starts offline when the browser already reports no connection and can be dismissed after return', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const onReload = vi.fn()
    render(<ConnectivityBanner onReload={onReload} />)
    expect(screen.getByRole('status').textContent).toMatch(/You are offline/)
    act(() => { window.dispatchEvent(new Event('online')) })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(onReload).not.toHaveBeenCalled()
  })
})
