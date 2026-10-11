// Production entry: HTTP gateway only. No fixture module or data is imported from this graph,
// and no API failure may switch to fixtures (contract README; R5).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createHttpGateway } from './data/http/httpGateway'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
createRoot(root).render(
  <StrictMode>
    <App gateway={createHttpGateway()} />
  </StrictMode>,
)
