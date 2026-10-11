// Development/test entry only (dev-fixtures.html). Excluded from production builds by
// vite.config.ts. Shows a permanent visible label so fixture data is unmistakable.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import '@/styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
createRoot(root).render(
  <StrictMode>
    <div className="flex h-full flex-col">
      <p role="note" className="shrink-0 bg-warn/15 px-3 py-1 text-center text-[12px] font-semibold text-warn">
        Development fixtures — synthetic data only. Nothing is sent, received or saved.
      </p>
      <div className="min-h-0 flex-1">
        <App gateway={createFixtureGateway()} />
      </div>
    </div>
  </StrictMode>,
)
