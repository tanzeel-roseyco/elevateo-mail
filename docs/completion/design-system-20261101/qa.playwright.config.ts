import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig(base, { use: { ...base.use, launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] } } })
