import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(CONFIG_DIR, "..", "..", "..", "test-results", "demo");

// Workers inherit env set while the config loads.
process.env.ARGOS_E2E_DEMO_OUTPUT_DIR ??= OUTPUT_DIR;

export default defineConfig({
  testDir: CONFIG_DIR,
  testMatch: "**/*.demo.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 600_000,
  expect: {
    timeout: 30_000,
  },
  reporter: [["list"]],
  outputDir: resolve(OUTPUT_DIR, "artifacts"),
  use: {
    testIdAttribute: "data-testid",
  },
});
