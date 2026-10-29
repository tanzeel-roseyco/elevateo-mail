import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { createDemoGateway, DEMO_MAILBOX_ID } from './demoGateway'
import { createSimulatedConnectorGrantsGateway } from '@/data/fixtures/simulatedConnectorGrants'
import '@/styles/index.css'

// AIDEV-NOTE: A fresh demo opens a usable inbox; subsequent navigation still belongs to the URL.
if (!window.location.hash) window.history.replaceState(null, '', `#/mailboxes/${DEMO_MAILBOX_ID}`)
const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
createRoot(root).render(
  <StrictMode>
    <div className="flex h-full flex-col">
      <p role="note" className="shrink-0 bg-warn/15 px-3 py-1 text-center text-[12px] font-semibold text-warn">
        Synthetic demo | Fictitious people and mail | No network or mail sending | Changes reset on reload
      </p>
      <div className="min-h-0 flex-1"><App gateway={createDemoGateway()} featureGateways={{ simulatedSettings: true, connectorGrants: createSimulatedConnectorGrantsGateway() }} /></div>
    </div>
  </StrictMode>,
)
