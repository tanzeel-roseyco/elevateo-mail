import { useSyncExternalStore } from 'react'

export type PwaStatus = 'idle' | 'ready' | 'waiting' | 'error'
let status: PwaStatus = 'idle'
const listeners = new Set<() => void>()
function publish(next: PwaStatus) {
  status = next
  listeners.forEach((listener) => listener())
}
export function usePwaStatus(): PwaStatus {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => status)
}

// AIDEV-NOTE: No skipWaiting, claim or controllerchange reload; natural activation protects every open tab.
export async function registerPwa(): Promise<void> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext || window.location.pathname.startsWith('/auth/')) return
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    const inspect = () => {
      if (registration.waiting) publish('waiting')
      else if (registration.active) publish('ready')
    }
    inspect()
    const watchInstalling = () => {
      const installing = registration.installing
      installing?.addEventListener('statechange', () => {
        inspect()
        if (installing.state === 'redundant') publish('error')
      })
    }
    watchInstalling()
    registration.addEventListener('updatefound', watchInstalling)
    // Visibility checks find updates in long-lived installed windows without an always-running timer.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update().then(inspect).catch(() => publish('error'))
    })
  } catch {
    publish('error')
  }
}
