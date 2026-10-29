import { useLayoutEffect, useRef } from 'react'

type NoticeInset = '--simulation-inset' | '--fixture-inset'

// AIDEV-NOTE: Each persistent notice owns one inset; CSS adds them for all viewport-docked UI.
// Measure wrapping and zoom rather than assuming a line count. Cleanup also handles sign-out.
export function useBottomNotice(inset: NoticeInset) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const style = document.documentElement.style
    const measure = () => style.setProperty(inset, `${element.getBoundingClientRect().height}px`)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      style.removeProperty(inset)
    }
  }, [inset])
  return ref
}
