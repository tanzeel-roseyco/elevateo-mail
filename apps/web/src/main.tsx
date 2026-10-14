// Production entry: HTTP gateway only. No fixture module or data is imported from this graph,
// and no API failure may switch to fixtures (contract README; R5).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { isAuthCompletePath } from './app/entry'
import { bridgeOutreachGateway } from './app/outreachGatewayBridge'
import { createHttpGateway } from './data/http/httpGateway'
import { createV2OutreachGateway } from './data/v2OutreachGateway'
import { AuthCompletePage } from './features/auth/AuthCompletePage'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
const gateway = createHttpGateway()
// AIDEV-NOTE: FE-805 production feature gateways. Outreach is Cassian's isolated V2 adapter over the
// same bounded transport, bridged to Celeste's port (see outreachGatewayBridge). Account routes are
// inert in the adapter; Lyra's pages bind the V2 grant gateway directly. Nothing is simulated here.
const featureGateways = { outreach: bridgeOutreachGateway(createV2OutreachGateway()) }
createRoot(root).render(
  <StrictMode>
    {isAuthCompletePath(window.location.pathname) ? <AuthCompletePage gateway={gateway} /> : <App gateway={gateway} featureGateways={featureGateways} />}
  </StrictMode>,
)
