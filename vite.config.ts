import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "SISTRUT V2",
        short_name: "SISTRUT",
        description: "Cálculo de estruturas de concreto armado (NBR 6118:2023 e NB-1/78)",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        lang: "pt-BR",
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    projects: [
      // motor de cálculo, domínio e lógica pura: Node, sem DOM
      { extends: true, test: { name: "unidade", include: ["src/**/*.test.ts"] } },
      // telas exercitadas como o usuário (cliques, teclado) num DOM simulado, sem servidor
      {
        extends: true,
        test: {
          name: "telas",
          include: ["src/**/*.ui.test.tsx"],
          environment: "happy-dom",
          setupFiles: ["src/test-setup.ts"],
          // a montagem do editor de planta leva ~4 s com a máquina carregada;
          // 5 s (padrão) dava falso timeout
          testTimeout: 30_000,
        },
      },
    ],
  },
});
