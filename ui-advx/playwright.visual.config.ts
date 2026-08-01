import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 5184;
const EVIDENCE_ROOT = process.env.TEENX_PROFILE_EVIDENCE_ROOT
  ? path.resolve(process.env.TEENX_PROFILE_EVIDENCE_ROOT)
  : path.resolve(import.meta.dirname, "../output/playwright/teenx-profile-final-review");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "profile-visual.spec.ts",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    screenshot: "off",
    trace: "on",
  },
  projects: [
    { name: "desktop-1440x900", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet-768x1024", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile-390x844", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `pnpm --filter @advx/ui exec vite --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  outputDir: path.join(EVIDENCE_ROOT, "test-results"),
  reporter: [["list"]],
});
