// A seção "Tipos" de docs/VISTA-3D.md copia as declarações públicas da vista 3D (as que
// api.ts exporta). Este teste falha se o código mudar e o documento ficar para trás:
// quem escreve uma camada lê o documento, não o código.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(resolve(raiz, p), "utf8").replace(/\r\n/g, "\n");

/** Declarações copiadas no documento, por arquivo, na ordem da seção "Tipos". */
const TIPOS_DOCUMENTADOS: [string, string[]][] = [
  [
    "src/telas/obra3d/camadas.ts",
    ["Camada", "DefinicaoCamada", "ContextoVista", "EventoVista", "Exibicao", "PapelMaterial"],
  ],
  [
    "src/telas/obra3d/modelo.ts",
    ["Modelo3D", "Nivel", "Elemento3D", "TipoElemento", "Solido", "Ponto3", "Coluna", "Eixo3D"],
  ],
  ["src/telas/obra3d/dados.ts", ["DadosElemento", "Estado", "GrandezaMapa"]],
];

/** O texto de `export interface Nome {…}` ou `export type Nome = …;` no código. */
function declaracao(fonte: string, nome: string): string {
  const linhas = fonte.split("\n");
  const i = linhas.findIndex((l) => new RegExp(`^export (interface|type) ${nome}\\b`).test(l));
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

describe("docs/VISTA-3D.md, seção Tipos", () => {
  const doc = ler("docs/VISTA-3D.md");
  for (const [arquivo, nomes] of TIPOS_DOCUMENTADOS) {
    const fonte = ler(arquivo);
    for (const nome of nomes)
      it(`${nome} (${arquivo.split("/").pop()}) está no documento como no código`, () => {
        expect(doc).toContain(declaracao(fonte, nome));
      });
  }

  it("api.ts exporta todos os tipos documentados", () => {
    const api = ler("src/telas/obra3d/api.ts");
    for (const [, nomes] of TIPOS_DOCUMENTADOS)
      for (const nome of nomes) expect(api).toMatch(new RegExp(`\\b${nome}\\b`));
  });
});
