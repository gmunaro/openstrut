/// <reference types="node" />
// Arquivos do oráculo versionados em `arquivos/` (origem e trocas no README.md de lá).
// A pasta espelha as de trabalho: `oraculo/` (runs, casos, orig) e
// `v2-paridade/oraculo-novos/`; os JSONs e comentários citam os caminhos assim
// ("oraculo/runs/<run>/obra/E2E.VIG").
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("./arquivos/", import.meta.url));

/** Caminho no disco de um arquivo (ou pasta) do oráculo, dado como nos JSONs:
 *  `arquivoOraculo("oraculo/runs/<run>/impressora.prn")`. Sem o arquivo no
 *  repositório, lança erro com o caminho: teste de paridade falha, não é pulado. */
export function arquivoOraculo(caminho: string) {
  const p = join(RAIZ, caminho);
  if (!existsSync(p))
    throw new Error(
      `arquivo do oráculo ausente: ${caminho} (procurado em src/calculo/sistrut/__oraculo__/arquivos/; veja o README.md de lá)`,
    );
  return p;
}
