// Web side of the desktop shell's update guard and menu: reports "busy" (unsaved draft edits or an
// unresolved send approval) and "ready" (a meaningful screen rendered) to the native host, and
// runs the web sign-out when the native menu's Sign Out fires, and shows the native update status
// ("Check for Updates…" menu) as text. In a browser every call is a no-op.
//
// AIDEV-NOTE: couples to apps/native/src-tauri/src/host.rs (host_report_busy, host_ready) and the
// `host://sign-out` / `host://update` events emitted by lib.rs and host.rs; Tauri maps these
// camelCase args to snake_case params.
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { detectDesktopHost, type DesktopHost } from '@/features/assistant/bridge'

export type DesktopBusyKey = 'unsavedDraft' | 'sendInProgress'

// The injected host object never changes within a page load; parse it once so hook dependencies
// stay stable (a fresh parse per render would re-run every effect).
let cachedHost: DesktopHost | null | undefined
function currentHost(): DesktopHost | null {
  if (cachedHost === undefined) cachedHost = detectDesktopHost()
  return cachedHost
}

const busy: Record<DesktopBusyKey, boolean> = { unsavedDraft: false, sendInProgress: false }
const reported: Record<DesktopBusyKey, boolean> = { unsavedDraft: false, sendInProgress: false }

/**
 * Records one busy signal and sends the combined state. The host blocks updates until both
 * sources have reported at least once, so every provider reports its initial state on mount.
 */
export function reportDesktopBusy(key: DesktopBusyKey, value: boolean, host: DesktopHost | null = currentHost()): void {
  if (host === null) return
  if (reported[key] && busy[key] === value) return
  busy[key] = value
  reported[key] = true
  host
    .invoke('host_report_busy', {
      unsavedDraft: busy.unsavedDraft,
      sendInProgress: busy.sendInProgress,
      // The host treats a partial report as "unknown" and keeps blocking installs.
      complete: reported.unsavedDraft && reported.sendInProgress,
    })
    // Deliberate diagnostic: the host keeps its last known state, so an update stays blocked.
    .catch((error: unknown) => console.error('Desktop busy report failed; updates stay blocked.', error))
}

/** Test seam: forget reported state and the cached host so each test starts from "unknown". */
export function resetDesktopHostForTests(): void {
  busy.unsavedDraft = busy.sendInProgress = false
  reported.unsavedDraft = reported.sendInProgress = false
  cachedHost = undefined
}

/**
 * Tells the host a meaningful screen rendered (the signed-in shell or the sign-in page): the
 * post-update health check passes. `enabled` stays false while the session is still loading.
 */
export function useDesktopReady(enabled: boolean, host: DesktopHost | null = currentHost()): void {
  useEffect(() => {
    if (!enabled || host === null) return
    host
      .invoke('host_ready')
      // Not swallowed: without readiness the next launch rolls the update back, so log why.
      .catch((error: unknown) => console.error('Desktop readiness report failed.', error))
  }, [enabled, host])
}

/** Runs `signOut` when the native menu's Sign Out fires (native tokens are already cleared). */
export function useDesktopSignOut(signOut: () => void, host: DesktopHost | null = currentHost()): void {
  useEffect(() => {
    if (host === null) return
    let unlisten: (() => void) | null = null
    let disposed = false
    host
      .listen('host://sign-out', () => signOut())
      .then((stop) => {
        if (disposed) stop()
        else unlisten = stop
      })
      .catch((error: unknown) => console.error('Desktop sign-out menu could not be connected.', error))
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [host, signOut])
}

// host.rs emit_update statuses; anything else is a contract drift and is reported, not shown.
const updateNoticeSchema = z.object({
  status: z.enum(['unconfigured', 'checking', 'up_to_date', 'blocked_busy', 'downloading', 'installed', 'error']),
  message: z.string().min(1).max(500),
})
export type DesktopUpdateNotice = z.infer<typeof updateNoticeSchema>

/** Latest native update status (plain text, never HTML), or null before the person checked. */
export function useDesktopUpdateNotice(host: DesktopHost | null = currentHost()): DesktopUpdateNotice | null {
  const [notice, setNotice] = useState<DesktopUpdateNotice | null>(null)
  useEffect(() => {
    if (host === null) return
    let unlisten: (() => void) | null = null
    let disposed = false
    host
      .listen('host://update', (payload) => {
        const parsed = updateNoticeSchema.safeParse(payload)
        if (parsed.success) setNotice(parsed.data)
        else console.error('Desktop update status had an unexpected shape.', parsed.error)
      })
      .then((stop) => {
        if (disposed) stop()
        else unlisten = stop
      })
      .catch((error: unknown) => console.error('Desktop update status could not be connected.', error))
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [host])
  return notice
}
