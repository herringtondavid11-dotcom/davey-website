import { defineConfig, devices } from '@playwright/test'

// Desktop Chrome, desktop Safari (WebKit), and a phone-sized Chrome viewport. Firefox stays out of the default run.
const { defaultBrowserType: _pixelBrowser, ...pixel5 } = devices['Pixel 5']

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off', locale: 'en-US', timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...pixel5 } },
  ],
  webServer: { command: 'node e2e/pages-server.mjs', url: 'http://localhost:4173/app/', reuseExistingServer: true },
})
