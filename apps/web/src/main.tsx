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
// server-side, V2 has no Outreach read endpoints, and Cassian's grant DTO (user_id, three roles)
// does not yet match Lyra's AdminGateway snapshot (person_key, people, seven roles). Each page
// shows its own "not connected" state until the owners reconcile; nothing is simulated here.
const featureGateways = {}
createRoot(root).render(
  <StrictMode>
    {isAuthCompletePath(window.location.pathname) ? <AuthCompletePage gateway={gateway} /> : <App gateway={gateway} featureGateways={featureGateways} />}
  </StrictMode>,
)
