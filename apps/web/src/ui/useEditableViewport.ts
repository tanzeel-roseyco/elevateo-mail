import { useEffect } from 'react'

const keyboardInputs = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])

export function useEditableViewport() {
  useEffect(() => {
    let frame: number | undefined
    const viewport = window.visualViewport
    const reveal = () => {
      frame = undefined
      const field = document.activeElement
      if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) return
      if (field.disabled || field.readOnly || (field instanceof HTMLInputElement && !keyboardInputs.has(field.type))) return
      const bounds = field.getBoundingClientRect()
      const top = viewport?.offsetTop ?? 0
      const height = viewport?.height ?? window.innerHeight
      if (height <= 0 || bounds.height <= 0) return
      const bottom = top + height
      // AIDEV-NOTE: Oversized fields cannot fit; keep a field that already spans the usable viewport stable.
      if (bounds.top <= top && bounds.bottom >= bottom) return
      if (bounds.top >= top && bounds.bottom <= bottom) return
      // AIDEV-NOTE: Native IME insets resize the WebView; nested DOM scrollers still need to reveal the focused field.
      field.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    }
    const schedule = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(reveal)
    }
    document.addEventListener('focusin', schedule)
    window.addEventListener('resize', schedule)
    viewport?.addEventListener('resize', schedule)
    return () => {
      document.removeEventListener('focusin', schedule)
      window.removeEventListener('resize', schedule)
      viewport?.removeEventListener('resize', schedule)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [])
}
