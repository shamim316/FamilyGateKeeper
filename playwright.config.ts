import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a real Supabase project.
 *
 * These are skipped unless the environment is configured, because they need
 * something the repository cannot carry: a live project, with `Confirm email`
 * off so signing up needs no mailbox. Everything below the sign-in step is
 * covered by the component and ceremony suites in `npm test`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    // Chromium is preinstalled in this environment; do not let Playwright
    // fetch its own.
    launchOptions: process.env.PLAYWRIGHT_BROWSERS_PATH
      ? {}
      : { executablePath: '/opt/pw-browsers/chromium' },
  },

  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npm run start',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
