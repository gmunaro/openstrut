import { defineConfig } from "@playwright/test";

// Porta do servidor de teste: PORT (padrão 4173). Worktrees em paralelo usam portas
// diferentes para não reaproveitar o servidor de outro.
const porta = Number(process.env.PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  // usa o Chrome instalado na máquina (o Chromium do Playwright não está baixado)
  use: { baseURL: `http://localhost:${porta}`, channel: "chrome" },
  webServer: {
    // build próprio em dist-e2e: as chaves falsas do Google abaixo não vão para o dist/
    command: `bun x tsr generate && bun x tsc -b && bun x vite build --outDir dist-e2e && bun x vite preview --outDir dist-e2e --port ${porta} --strictPort`,
    port: porta,
    // um servidor já de pé na porta é usado; e2e/drive.spec.ts recusa o que não tem as
    // chaves de teste (para outro e rode de novo)
    reuseExistingServer: true,
    // a importação pelo Google Drive só aparece ligada com as duas variáveis; no e2e as
    // chamadas ao Google são interceptadas (e2e/drive.spec.ts), então valem valores falsos
    env: {
      VITE_GOOGLE_CLIENT_ID: "123456789012-e2e.apps.googleusercontent.com",
      VITE_GOOGLE_API_KEY: "chave-e2e",
    },
  },
});
