// Cloud-mode browser suite: real Pages Functions (wrangler pages dev) against a
// real Postgres with the repository migrations applied. See tests/cloud/stack.mjs.
const { defineConfig, devices } = require('@playwright/test');

const siteUrl = 'http://127.0.0.1:8788';

module.exports = defineConfig({
  testDir: './tests/cloud',
  testMatch: /.*\.spec\.js$/,
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [['list']],
  use: {
    baseURL: siteUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    // Optional: point at a pre-installed Chromium (sandboxes). Unset in CI.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {}
  },
  webServer: {
    command: 'node tests/cloud/stack.mjs',
    url: siteUrl,
    reuseExistingServer: false,
    timeout: 180000
  }
});
