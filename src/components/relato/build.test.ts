import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

// O diagnóstico do relato mostra o commit do build (`VITE_COMMIT`). Sem ele no
// build publicado, todo relato chega com "não informado no build" (issue #1).
test("o build do Pages informa o commit ao diagnóstico", () => {
  const yml = readFileSync(
    path.resolve(import.meta.dirname, "../../../.github/workflows/pages.yml"),
    "utf8",
  );
  const passo = yml.split(/\n\s*- /).find((p) => p.includes("bun run build:pages"));
  expect(passo).toMatch(/\n\s+VITE_COMMIT:\s*["']?\$\{\{\s*github\.sha\s*\}\}/);
});

// O relay (relato-worker) só vale no site publicado se o build receber a URL dele.
test("o build do Pages liga o relay pela variável RELATO_URL", () => {
  const yml = readFileSync(
    path.resolve(import.meta.dirname, "../../../.github/workflows/pages.yml"),
    "utf8",
  );
  const passo = yml.split(/\n\s*- /).find((p) => p.includes("bun run build:pages"));
  expect(passo).toMatch(/\n\s+VITE_RELATO_URL:\s*\$\{\{\s*vars\.RELATO_URL\s*\}\}/);
});
