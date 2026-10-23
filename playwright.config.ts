import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 5199;
const API_PORT = 8799;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'e2e', testIgnore: /screens\.spec\.ts/ },
    { name: 'screens', testMatch: /screens\.spec\.ts/ },
  ],
  webServer: {
    // Always mock mode for tests: blank the key explicitly.
    command: `npm run dev`,
    url: `http://127.0.0.1:${WEB_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ANTHROPIC_API_KEY: '',
      HYPEMAN_FORCE_MOCK: '1',
      HYPEMAN_WEB_PORT: String(WEB_PORT),
      HYPEMAN_API_PORT: String(API_PORT),
      HYPEMAN_NO_OPEN: '1',
    },
  },
});
