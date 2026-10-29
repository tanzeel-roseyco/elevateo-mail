import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// AIDEV-NOTE: Synthetic entries stay outside production output; demo mode preserves canonical fixture oracles.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    // The fixture module imports canonical contracts/v1/fixtures.json from the repository root.
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
  build: {
    // Emit the manifest so scripts/check-bundle-budget.mjs can find the entry chunk deterministically.
    manifest: true,
    // Entry (main) chunk budget is 500 KB minified; scripts/check-bundle-budget.mjs enforces it.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      input:
        mode === 'production'
          ? { app: fileURLToPath(new URL('./index.html', import.meta.url)) }
          : {
              app: fileURLToPath(new URL('./index.html', import.meta.url)),
              fixtures: fileURLToPath(new URL('./dev-fixtures.html', import.meta.url)),
              ...(mode === 'demo' ? { demo: fileURLToPath(new URL('./demo.html', import.meta.url)) } : {}),
            },
      output: {
        // AIDEV-NOTE: Split node_modules per library into eager, parallel-loaded chunks so no single
        // chunk breaches the 500 KB warning limit and the first-party entry chunk stays small. Routes
        // are already React.lazy chunks (App.tsx); this only moves vendor weight out of the entry.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-router')) return 'router'
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react'
          if (id.includes('/zod/')) return 'zod'
          if (id.includes('@radix-ui')) return 'radix'
          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // AIDEV-NOTE: Vitest globals are disabled; the setup imports cleanup hooks explicitly.
    setupFiles: ['./src/test/setup.ts'],
  },
}))
