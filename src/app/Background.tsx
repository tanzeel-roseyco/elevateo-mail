import { usePrefs } from './appearance'

/** Optional user background. Blurred and scaled slightly so blurred edges never show the page colour. */
export function Background() {
  const image = usePrefs((s) => s.prefs.bgImage)
  if (!image) return null
  return <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 scale-105 bg-cover bg-center" style={{ backgroundImage: `url("${image}")`, filter: 'blur(var(--bg-blur))' }} />
}
