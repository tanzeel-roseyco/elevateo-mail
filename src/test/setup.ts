import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no matchMedia; components only need a stable "no match" answer.
window.matchMedia ??= (query: string) =>
  ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList

afterEach(() => {
  cleanup()
  localStorage.clear()
})
