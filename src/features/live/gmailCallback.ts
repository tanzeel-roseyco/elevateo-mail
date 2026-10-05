// AIDEV-NOTE: Capture before the router mounts; OAuth codes never enter storage or remain in the address bar.
export function captureGmailCallback(location: Pick<Location, 'pathname' | 'href' | 'search'>, history: Pick<History, 'replaceState'>): string | null {
  if (location.pathname !== '/connections/gmail/callback' || !location.search) return null
  const callback = location.href
  history.replaceState(null, '', '/connections/gmail/callback')
  return callback.length <= 16384 ? callback : null
}
let pending = captureGmailCallback(window.location, window.history)
export function takeGmailCallback(): string | null { const value = pending; pending = null; return value }
