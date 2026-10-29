// Development/test entry only (dev-fixtures.html). Excluded from production builds by
// vite.config.ts. Shows a permanent visible label so fixture data is unmistakable.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { createFixtureGateway, type FixtureScript } from '@/data/fixtures/fixtureGateway'
import { AuthCompletePage } from '@/features/auth/AuthCompletePage'
import '@/styles/index.css'

// AIDEV-NOTE: Browser checks pick fixture examples per operation through the URL hash
// (#/fixtures?getSession=unauthenticated&login=rate_limited) and reach the completion form
// through #/auth/complete; neither mechanism exists in the production entry.
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
createRoot(root).render(
  <StrictMode>
    <div className="flex h-full flex-col">
      <p role="note" className="shrink-0 bg-warn/15 px-3 py-1 text-center text-[12px] font-semibold text-warn">
        Development fixtures — synthetic data only. Nothing is sent, received or saved.
      </p>
      <div className="min-h-0 flex-1">{completion ? <AuthCompletePage gateway={gateway} /> : <App gateway={gateway} />}</div>
    </div>
  </StrictMode>,
)
