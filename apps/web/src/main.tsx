// Production entry: HTTP gateway only. No fixture module or data is imported from this graph,
// and no API failure may switch to fixtures (contract README; R5).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import type { FeatureGateways } from './app/featureGateways'
import { isAuthCompletePath } from './app/entry'
import { createHttpGateway } from './data/http/httpGateway'
import { createV2Gateway } from './data/v2Gateway'
import { createV2OutreachGateway } from './data/v2OutreachGateway'
import { createV2AssigneeOptionsGateway } from './data/v2AssigneeOptionsGateway'
import { createV2AttachmentGateway } from './data/v2AttachmentGateway'
import { createV2EmailFinderGateway } from './data/v2EmailFinderGateway'
import type { OutreachGateway } from './features/outreach/contract'
import { AuthCompletePage } from './features/auth/AuthCompletePage'
import './styles/index.css'
import { PwaFrame } from './pwa/PwaFrame'
import { registerPwa } from './pwa/lifecycle'
import { detectDesktopHost } from './features/assistant/bridge'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
const gateway = createHttpGateway()
// AIDEV-NOTE: FE-805 production feature gateways. Outreach is Cassian's isolated V2 adapter over the
// same bounded transport; the explicit port type makes any drift from Celeste's OutreachGateway a
// typecheck failure rather than a runtime surprise. Account reads are campaign-scoped and still
// rejected by the adapter until the account route is registered; Lyra's pages bind the V2 grant
// gateway directly. Nothing is simulated here.
const outreach: OutreachGateway = createV2OutreachGateway()
// Direct message reads for a permalink beyond the loaded thread page go through Cassian's exact V2
// reader; Mira's page owns the session policy and the mailbox/thread checks on the response.
const v2 = createV2Gateway()
const featureGateways: FeatureGateways = {
  emailFinder: createV2EmailFinderGateway(),
  outreach,
  assigneeOptions: createV2AssigneeOptionsGateway(),
  attachmentPort: createV2AttachmentGateway(),
  readDirectMessage: (ctx, mailboxId, threadId, messageId, signal) => v2.getDirectMessage(ctx, mailboxId, threadId, messageId, signal),
  // AIDEV-NOTE: contract-request — deliveryReports (Bounces/Suppressions) is intentionally unset:
  // the proposed routes do not exist in contracts/v2 yet, so the pages show an honest unavailable
  // state. createHttpDeliveryReportsGateway() is ready to bind here once the endpoints ship.
}
const browserApp = !isAuthCompletePath(window.location.pathname) && !detectDesktopHost()
createRoot(root).render(
  <StrictMode>
    {browserApp && <PwaFrame />}
    {isAuthCompletePath(window.location.pathname) ? <AuthCompletePage gateway={gateway} /> : <App gateway={gateway} featureGateways={featureGateways} />}
  </StrictMode>,
)

// AIDEV-NOTE: Native hosts own their update notice; callbacks and fixture builds never register the worker.
if (import.meta.env.PROD && browserApp) {
  if (document.readyState === 'complete') void registerPwa()
  else window.addEventListener('load', () => { void registerPwa() }, { once: true })
}
