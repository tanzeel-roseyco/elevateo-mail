import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
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
