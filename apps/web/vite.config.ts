import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// AIDEV-NOTE: dev-fixtures.html is only an input outside production builds; R5 requires fixtures out of prod output.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    // The fixture module imports canonical contracts/v1/fixtures.json from the repository root.
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
  build: {
    rollupOptions: {
      input:
        mode === 'production'
          ? { app: fileURLToPath(new URL('./index.html', import.meta.url)) }
          : {
              app: fileURLToPath(new URL('./index.html', import.meta.url)),
              fixtures: fileURLToPath(new URL('./dev-fixtures.html', import.meta.url)),
            },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: [],
  },
}))
