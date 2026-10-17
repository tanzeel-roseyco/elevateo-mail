import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// AIDEV-NOTE: Vitest globals stay disabled, so Testing Library cannot register its automatic cleanup hook.
afterEach(cleanup)
