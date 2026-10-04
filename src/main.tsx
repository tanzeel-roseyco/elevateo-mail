import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'

// AIDEV-NOTE: Two separate apps, chosen at build time. VITE_BACKEND=api builds the server-backed app, which contains
// no mock gateway and no fixture mail; anything else builds the demonstration, which contains no HTTP client.
const mode: unknown = import.meta.env.VITE_BACKEND ?? 'demo'
if (mode !== 'demo' && mode !== 'api') throw new Error(`VITE_BACKEND must be "demo" or "api", not "${String(mode)}"`)

const App =
  import.meta.env.VITE_BACKEND === 'api'
    ? lazy(() => import('./features/live/LiveApp').then((m) => ({ default: m.LiveApp })))
    : lazy(() => import('./app/App').then((m) => ({ default: m.App })))

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
)
