import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

/** Caminho onde o app é servido. Padrão "/" (instalador desktop, em
 *  http://127.0.0.1:41780/); o GitHub Pages usa OPENSTRUT_BASE=/openstrut/
 *  (bun run build:pages). O router (main.tsx) e o manifest seguem o mesmo valor. */
const pasta = (process.env.OPENSTRUT_BASE ?? "").replace(/^\/+|\/+$/g, "");
const base = pasta ? `/${pasta}/` : "/";

export default defineConfig({
  base,
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "OpenStrut V2",
        short_name: "OpenStrut",
        description: "Cálculo de estruturas de concreto armado (NBR 6118:2023 e NB-1/78)",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        lang: "pt-BR",
        scope: base,
        start_url: base,
        // caminhos relativos ao manifest: valem com qualquer base
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
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
