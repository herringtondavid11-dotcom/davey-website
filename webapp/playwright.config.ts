import { defineConfig, devices } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'

// Only run browsers that are installed in this environment (Chromium is preinstalled; WebKit/Firefox when present).
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH
const installed = (name: string) => !browsersPath || (existsSync(browsersPath) && readdirSync(browsersPath).some((d) => d.startsWith(name)))

const all = [
  { name: 'chromium', use: { ...devices['Desktop Chrome']} },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
]

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off', locale: 'en-US', timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' },
  projects: all.filter((p) => installed(p.name)),
  webServer: { command: 'node e2e/pages-server.mjs', url: 'http://localhost:4173/app/', reuseExistingServer: true },
})
