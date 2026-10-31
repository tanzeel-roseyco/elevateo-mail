import { useEffect, useRef, useState } from 'react'
import { Callout } from '@/ui/Callout'
import { Button } from '@/ui/Button'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
const DISMISS_KEY = 'elevateo.pwa.install-dismissed'
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && navigator.standalone === true)
function wasDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

// AIDEV-NOTE: Only a nonpersonal dismissal flag persists. Browser prompts require an explicit user gesture.
export function InstallApp() {
  const [installed, setInstalled] = useState(isInstalled)
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const fallbackFocus = useRef<HTMLDetailsElement>(null)
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  useEffect(() => {
    const before = (event: Event) => {
      if (!('prompt' in event) || typeof event.prompt !== 'function' || !('userChoice' in event)) return
      event.preventDefault()
      setPrompt(event as InstallEvent)
    }
    const done = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', before)
    window.addEventListener('appinstalled', done)
    return () => {
      window.removeEventListener('beforeinstallprompt', before)
      window.removeEventListener('appinstalled', done)
    }
  }, [])
  if (installed) return null
  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* This window still respects dismissal if storage is blocked. */ }
    fallbackFocus.current?.querySelector('summary')?.focus()
  }
  const install = async () => {
    if (!prompt || busy) return
    setBusy(true)
    setError(false)
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === 'dismissed') dismiss()
      else setInstalled(true)
    } catch { setError(true) }
    finally { setBusy(false); setPrompt(null) }
  }
  return <Callout variant="brand-outline" icon={false} label="Install Elevateo Mail">
    {/* AIDEV-NOTE: Reserve the offer row before the browser event to avoid shifting content during installation. */}
    {!dismissed && <div className="flex flex-wrap items-center gap-3">
      <span>{ios ? 'Install from the Share menu: Add to Home Screen, then Open as Web App if shown.' : 'Open Elevateo Mail in its own app window.'}</span>
      {!ios && <Button variant="brand-outline" size="sm" disabled={!prompt || busy} title="If unavailable, use Install help below" onClick={() => void install()}>{busy ? 'Opening install…' : 'Install app'}</Button>}
      <Button size="sm" variant="brand-outline" onClick={dismiss}>Not now</Button>
    </div>}
    {error && <p role="alert">Installation did not open. Use your browser menu, or try again on your next visit.</p>}
    <details ref={fallbackFocus}>
      <summary className="cursor-pointer py-1">Install help</summary>
      <p>Chrome or Edge: open the browser menu and choose Install app. On iPhone or iPad, open in Safari, choose Share, then Add to Home Screen. If installation is unavailable, continue in your browser.</p>
      <p>Only the app shell works offline. Mail, attachments and sending need a connection.</p>
    </details>
  </Callout>
}
