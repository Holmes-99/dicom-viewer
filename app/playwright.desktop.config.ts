import { defineConfig } from '@playwright/test'

// Desktop checks: launches the Electron shell on the built viewer (run `npm run build` first).
export default defineConfig({
  testDir: 'e2e-desktop',
  outputDir: 'e2e-desktop/.results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
})
