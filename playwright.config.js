// Browser tests: npm run test:e2e
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:4173",
    // Optional: point at an existing Chrome/Chromium instead of Playwright's own.
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  webServer: {
    command: "npx --yes serve -l 4173 .",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});