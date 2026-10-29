// Development/test entry only (dev-fixtures.html). Excluded from production builds by
// vite.config.ts. Shows a permanent visible label so fixture data is unmistakable.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { createFixtureGateway, type FixtureScript } from '@/data/fixtures/fixtureGateway'
import { createSimulatedDeliveryReportsGateway } from '@/data/simulatedDeliveryReports'
import type { FeatureGateways } from '@/app/featureGateways'
import { AuthCompletePage } from '@/features/auth/AuthCompletePage'
import '@/styles/index.css'
import { useBottomNotice } from '@/ui/useBottomNotice'

// AIDEV-NOTE: Browser checks pick fixture examples per operation through the URL hash
// (#/fixtures?getSession=unauthenticated&login=rate_limited) and reach the completion form
// through #/auth/complete; neither mechanism exists in the production entry. The hash is read
// ONCE per document load: a same-document hash change does not re-script the running gateway.
function scriptFromHash(hash: string): FixtureScript {
  const query = hash.startsWith('#/fixtures?') ? hash.slice('#/fixtures?'.length) : ''
  const script: FixtureScript = {}
  for (const [operation, example] of new URLSearchParams(query)) script[operation] = example
  return script
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
const gateway = createFixtureGateway(scriptFromHash(window.location.hash))
const completion = window.location.hash === '#/auth/complete'
// `?production-settings` renders the settings pages exactly as the production entry does (no
// browser-local adapters), so their unavailable states can be captured against fixture data.
const simulatedSettings = !new URLSearchParams(window.location.search).has('production-settings')
// `?production-settings` also drops the simulated delivery-report port so the Bounces/Suppressions
// unavailable states can be captured exactly as production renders them.
const featureGateways: FeatureGateways = simulatedSettings
  ? { simulatedSettings: true, deliveryReports: createSimulatedDeliveryReportsGateway() }
  : {}
createRoot(root).render(
  <StrictMode>
    <div className="min-h-full pb-[var(--fixture-inset,0px)]">
      {completion ? <AuthCompletePage gateway={gateway} /> : <App gateway={gateway} featureGateways={featureGateways} />}
      <FixtureNotice />
    </div>
  </StrictMode>,
)

function FixtureNotice() {
  const ref = useBottomNotice('--fixture-inset')
  return (
    // AIDEV-NOTE: The lowest notice owns safe-area padding; the simulation strip owns it when present.
    <div ref={ref} role="note" className="pointer-events-none fixed inset-x-0 bottom-[var(--simulation-inset,0px)] z-30 border-t border-zinc-200 bg-zinc-50 px-3 pt-2 pb-[max(0.5rem,calc(env(safe-area-inset-bottom,0px)-var(--simulation-inset,0px)))] text-center text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      Development fixtures — synthetic data only. Nothing is sent, received or saved.
    </div>
  )
}
