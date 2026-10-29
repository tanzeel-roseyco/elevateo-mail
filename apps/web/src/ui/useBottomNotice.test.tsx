import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBottomNotice } from './useBottomNotice'

function Notice({ fixture = false }: { fixture?: boolean }) {
  const ref = useBottomNotice(fixture ? '--fixture-inset' : '--simulation-inset')
  return <div ref={ref}>Notice</div>
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('persistent notice geometry', () => {
  it('remeasures wrapped text and releases its inset on sign-out', () => {
    let height = 32
    let resize = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect = disconnect
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect)
    const { unmount } = render(<Notice />)
    const style = document.documentElement.style
    expect(style.getPropertyValue('--simulation-inset')).toBe('32px')
    height = 88
    resize()
    expect(style.getPropertyValue('--simulation-inset')).toBe('88px')
    unmount()
    expect(style.getPropertyValue('--simulation-inset')).toBe('')
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('keeps the fixture inset when the simulation notice is removed', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 40 } as DOMRect)
    const fixture = render(<Notice fixture />)
    const simulation = render(<Notice />)
    simulation.unmount()
    expect(document.documentElement.style.getPropertyValue('--fixture-inset')).toBe('40px')
    fixture.unmount()
    expect(document.documentElement.style.getPropertyValue('--fixture-inset')).toBe('')
  })

  it('responds to viewport resizing without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    let height = 20
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect)
    const { unmount } = render(<Notice />)
    height = 64
    window.dispatchEvent(new Event('resize'))
    expect(document.documentElement.style.getPropertyValue('--simulation-inset')).toBe('64px')
    unmount()
    window.dispatchEvent(new Event('resize'))
    expect(document.documentElement.style.getPropertyValue('--simulation-inset')).toBe('')
  })
})
