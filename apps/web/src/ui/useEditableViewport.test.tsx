import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditableViewport } from './useEditableViewport'

function Form() {
  useEditableViewport()
  return <><textarea aria-label="Note" /><input aria-label="Subject" /><input type="checkbox" aria-label="Selection" /></>
}

let frame: FrameRequestCallback | undefined
const scroll = vi.fn()

function flush() {
  const pending = frame
  frame = undefined
  act(() => pending?.(0))
}

function bounds(field: Element, top: number, bottom: number) {
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
    top, bottom, height: bottom - top, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}),
  })
}

beforeEach(() => {
  frame = undefined
  scroll.mockReset()
  vi.stubGlobal('innerHeight', 305)
  vi.stubGlobal('visualViewport', null)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scroll })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
})

describe('editable viewport', () => {
  it('reveals the focused note when Android IME shrinks the viewport after focus', () => {
    vi.stubGlobal('innerHeight', 568)
    const { getByRole } = render(<Form />)
    const note = getByRole('textbox', { name: 'Note' })
    bounds(note, 385, 481)
    note.focus(); flush()
    expect(scroll).not.toHaveBeenCalled()
    vi.stubGlobal('innerHeight', 305)
    fireEvent(window, new Event('resize')); flush()
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
  })

  it('leaves a visible control and an already spanning oversized control stable', () => {
    const { getByRole } = render(<Form />)
    const note = getByRole('textbox', { name: 'Note' })
    bounds(note, 50, 100)
    note.focus(); flush()
    bounds(note, -20, 400)
    fireEvent(window, new Event('resize')); flush()
    expect(scroll).not.toHaveBeenCalled()
  })

  it('uses visual viewport offsets and listens to its resize events', () => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 100, height: 200 })
    vi.stubGlobal('visualViewport', viewport)
    const { getByRole } = render(<Form />)
    const note = getByRole('textbox', { name: 'Note' })
    bounds(note, 90, 150)
    note.focus(); flush()
    expect(scroll).toHaveBeenCalledTimes(1)
    bounds(note, 110, 150)
    act(() => { viewport.dispatchEvent(new Event('resize')) }); flush()
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  it('coalesces events and re-reads focus instead of moving an obsolete field', () => {
    const { getByRole } = render(<Form />)
    const note = getByRole('textbox', { name: 'Note' })
    const subject = getByRole('textbox', { name: 'Subject' })
    bounds(note, 385, 481); bounds(subject, 10, 40)
    note.focus(); fireEvent(window, new Event('resize')); subject.focus(); flush()
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(scroll).not.toHaveBeenCalled()
  })

  it('ignores non-keyboard, disabled, readonly and zero-size controls', () => {
    const { getByRole } = render(<Form />)
    const selection = getByRole('checkbox')
    bounds(selection, 400, 430)
    selection.focus(); flush()
    const note = getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement
    bounds(note, 385, 481)
    note.focus(); note.disabled = true; flush()
    note.disabled = false; note.readOnly = true
    fireEvent(window, new Event('resize')); flush()
    note.readOnly = false; bounds(note, 0, 0)
    fireEvent(window, new Event('resize')); flush()
    expect(scroll).not.toHaveBeenCalled()
  })

  it('reveals an oversized control when it is entirely below the viewport', () => {
    const { getByRole } = render(<Form />)
    const note = getByRole('textbox', { name: 'Note' })
    bounds(note, 400, 800)
    note.focus(); flush()
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending frame and removes listeners when unmounted', () => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 305 })
    vi.stubGlobal('visualViewport', viewport)
    const { getByRole, unmount } = render(<Form />)
    getByRole('textbox', { name: 'Note' }).focus()
    unmount()
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1)
    fireEvent(window, new Event('resize')); act(() => { viewport.dispatchEvent(new Event('resize')) })
    fireEvent(document, new Event('focusin'))
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
  })
})
