import { defineConfig } from "@playwright/test";

// Porta do servidor de teste: PORT (padrão 4173). Worktrees em paralelo usam portas
// diferentes para não reaproveitar o servidor de outro.
const porta = Number(process.env.PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  // usa o Chrome instalado na máquina (o Chromium do Playwright não está baixado)
  use: { baseURL: `http://localhost:${porta}`, channel: "chrome" },
  webServer: {
    command: `bun run build && bun run preview --port ${porta} --strictPort`,
    port: porta,
    reuseExistingServer: true,
  },
});
