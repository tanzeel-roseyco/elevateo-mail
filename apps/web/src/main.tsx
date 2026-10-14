// Production entry: HTTP gateway only. No fixture module or data is imported from this graph,
// and no API failure may switch to fixtures (contract README; R5).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { isAuthCompletePath } from './app/entry'
import { createHttpGateway } from './data/http/httpGateway'
import { createV2OutreachGateway } from './data/v2OutreachGateway'
import type { OutreachGateway } from './features/outreach/contract'
import { AuthCompletePage } from './features/auth/AuthCompletePage'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
const gateway = createHttpGateway()
// AIDEV-NOTE: FE-805 production feature gateways. Outreach is Cassian's isolated V2 adapter over the
// same bounded transport; the explicit port type makes any drift from Celeste's OutreachGateway a
// typecheck failure rather than a runtime surprise. Account reads are campaign-scoped and still
// rejected by the adapter until the account route is registered; Lyra's pages bind the V2 grant
// gateway directly. Nothing is simulated here.
const outreach: OutreachGateway = createV2OutreachGateway()
const featureGateways = { outreach }
createRoot(root).render(
  <StrictMode>
    {isAuthCompletePath(window.location.pathname) ? <AuthCompletePage gateway={gateway} /> : <App gateway={gateway} featureGateways={featureGateways} />}
  </StrictMode>,
)
