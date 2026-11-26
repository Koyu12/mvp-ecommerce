import { defineConfig, devices } from '@playwright/test';

// Docker Compose reads Midtrans keys from the root .env; read the same file so the test sees what the API sees.
try {
  process.loadEnvFile(`${__dirname}/../../.env`);
} catch {
  // No root .env: keys come from the shell, if at all.
}

export default defineConfig({
  testDir: 'tests',
  // The tests drive one shared database through the running stack.
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
