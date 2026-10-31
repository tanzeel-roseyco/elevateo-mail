// AIDEV-NOTE: Keep shell assets and nonpersonal install preference; erase only Elevateo's session records.
export const SESSION_CLEARED_EVENT = 'elevateo:session-cleared'
export function clearSessionRecords(): void {
  let failed = false
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[name]
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      for (const key of keys) {
        if (key?.startsWith('elevateo.') && key !== 'elevateo.pwa.install-dismissed') {
          try {
            storage.removeItem(key)
            if (storage.getItem(key) !== null) failed = true
          } catch { failed = true }
        }
      }
    } catch { failed = true }
  }
  // Notify after deletion so synchronous subscribers cannot reload records that are being erased.
  window.dispatchEvent(new Event(SESSION_CLEARED_EVENT))
  if (failed) throw new Error('Local session records could not be cleared.')
}
