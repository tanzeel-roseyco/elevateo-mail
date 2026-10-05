import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // AIDEV-NOTE: API-backed builds call /v1 on their own origin (the server enables no CORS). The preview server
  // forwards those calls only when a target is configured; without one they fail, and the app says so.
  // The original Host is kept (no changeOrigin): the server checks a request's Origin against the host it was sent
  // to. /__fixture exists only on the Docker test server, where it starts a synthetic session.
  preview: process.env.API_PROXY_TARGET ? { proxy: { '/v1': { target: process.env.API_PROXY_TARGET }, '/__fixture': { target: process.env.API_PROXY_TARGET } } } : {},
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // AIDEV-NOTE: The 90% bar applies to domain rules only (STANDARDS §7); UI is covered by behaviour tests.
      include: ['src/domain/**'],
      exclude: ['src/domain/**/*.test.ts'],
      thresholds: { lines: 90 },
    },
  },
})
