// A seção "Referência da API" de docs/VISTA-3D.md é a cópia das declarações que api.ts
// exporta. Este teste falha se uma declaração mudar ou se api.ts exportar algo novo e o
// documento ficar para trás: quem escreve uma camada lê o documento, não o código.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(resolve(raiz, p), "utf8").replace(/\r\n/g, "\n");
const PASTA = "src/telas/obra3d";

/** Arquivo de um import relativo de api.ts (.ts ou .tsx). */
function arquivoDe(de: string) {
  const base = resolve(raiz, PASTA, de);
  return existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
}

/** Nomes exportados por api.ts e o arquivo de origem de cada um ("X as Y" conta X). */
function exportacoes() {
  const api = ler(`${PASTA}/api.ts`);
  return [...api.matchAll(/export (?:type )?\{([^}]*)\} from "([^"]+)";/g)].map(
    ([, nomes, de]) => ({
      arquivo: arquivoDe(de!),
      nomes: nomes!
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => n.split(/\s+as\s+/)[0]!),
    }),
  );
}

/** O texto de `export interface|type|const|function Nome …` até o fim da declaração. */
function declaracao(fonte: string, nome: string): string {
  const linhas = fonte.split("\n");
  const i = linhas.findIndex((l) =>
    new RegExp(`^export (interface|type|const|function) ${nome}\\b`).test(l),
  );
  if (i < 0) throw new Error(`sem a declaração ${nome}`);
  const saida: string[] = [];
  let fundo = 0;
  for (let k = i; k < linhas.length; k++) {
    const l = linhas[k]!;
    saida.push(l);
    for (const c of l) fundo += c === "{" ? 1 : c === "}" ? -1 : 0;
    if (fundo === 0 && (l.startsWith("}") || l.endsWith(";"))) break;
  }
  return saida.join("\n");
}

describe("docs/VISTA-3D.md, Referência da API", () => {
  const doc = ler("docs/VISTA-3D.md");
  const todas = exportacoes();

  it("a referência rápida do cabeçalho de api.ts está no documento", () => {
    const linhas = ler(`${PASTA}/api.ts`).split("\n");
    const fim = linhas.findIndex((l) => !l.startsWith("//"));
    expect(doc).toContain(linhas.slice(0, fim).join("\n"));
  });

  it("api.ts exporta alguma coisa", () => {
    expect(todas.flatMap((e) => e.nomes).length).toBeGreaterThan(20);
  });

  for (const { arquivo, nomes } of todas)
    for (const nome of nomes)
      it(`${nome} (${arquivo.split(/[\\/]/).pop()}) está no documento como no código`, () => {
        expect(doc).toContain(
          declaracao(readFileSync(arquivo, "utf8").replace(/\r\n/g, "\n"), nome),
        );
      });
});
