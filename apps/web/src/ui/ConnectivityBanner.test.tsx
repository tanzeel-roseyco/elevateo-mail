// FE-805 reports the browser's connectivity hint, which does not prove API reachability.
// Reload remains explicit after a reported return; no automatic refetch or offline cache is implied.
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

  it('reports the browser hint without reloading, then offers an explicit reload after return', () => {
    const onReload = vi.fn()
    render(<ConnectivityBanner onReload={onReload} />)
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(screen.getByRole('status').textContent).toMatch(/Your device reports a connection problem/)
    expect(screen.queryByRole('button')).toBeNull()
    expect(onReload).not.toHaveBeenCalled()
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(screen.getByRole('status').textContent).toMatch(/Your device reports a restored connection/)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('starts offline when the browser already reports no connection and can be dismissed after return', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const onReload = vi.fn()
    render(<ConnectivityBanner onReload={onReload} />)
    expect(screen.getByRole('status').textContent).toMatch(/Your device reports a connection problem/)
    act(() => { window.dispatchEvent(new Event('online')) })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(onReload).not.toHaveBeenCalled()
  })
})
