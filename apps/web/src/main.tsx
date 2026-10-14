// Production entry: HTTP gateway only. No fixture module or data is imported from this graph,
// and no API failure may switch to fixtures (contract README; R5).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { isAuthCompletePath } from './app/entry'
import { createHttpGateway } from './data/http/httpGateway'
import { AuthCompletePage } from './features/auth/AuthCompletePage'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
const gateway = createHttpGateway()
// AIDEV-NOTE: FE-805 feature gateways are intentionally empty in production: V2 routes are disabled
// server-side and V2 has no Outreach read/write endpoints yet, so no OutreachGateway adapter exists.
// Celeste's pages show their own "unavailable" state; Lyra's pages bind Cassian's V2 gateway
// directly. Nothing is simulated here.
const featureGateways = {}
createRoot(root).render(
  <StrictMode>
    {isAuthCompletePath(window.location.pathname) ? <AuthCompletePage gateway={gateway} /> : <App gateway={gateway} featureGateways={featureGateways} />}
  </StrictMode>,
)
