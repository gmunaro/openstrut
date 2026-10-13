import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // usa o Chrome instalado na máquina (o Chromium do Playwright não está baixado)
  use: { baseURL: "http://localhost:4173", channel: "chrome" },
  webServer: { command: "bun run build && bun run preview --port 4173", port: 4173, reuseExistingServer: true },
});
