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
    // a importação pelo Google Drive só aparece ligada com as duas variáveis; no e2e as
    // chamadas ao Google são interceptadas (e2e/drive.spec.ts), então valem valores falsos
    env: {
      VITE_GOOGLE_CLIENT_ID:
        process.env.VITE_GOOGLE_CLIENT_ID ?? "123456789012-e2e.apps.googleusercontent.com",
      VITE_GOOGLE_API_KEY: process.env.VITE_GOOGLE_API_KEY ?? "chave-e2e",
    },
  },
});
