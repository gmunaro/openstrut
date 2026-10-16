// Gera as obras de teste de e2e/ui-resultados.spec.ts com a mesma API do app.
// Rode da raiz do repositório: `bun e2e/fixtures/ui-resultados/gerar-obra.ts`.
// - corrigido, original, marcas-original: 4 lajes 4x5 m, vigas e 9 pilares.
// - paradas-original: geometria do r3 (v2par_laje_r3), sobrecarga 25 kN/m2 e
//   parametrosLaje.relacaoNegPosMin 0,35. Gera otimização dos negativos parada (L1,
//   lado 2) e vigas V3 e V4 interrompidas em "Continuo com o processamento" (modo original).
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "../../../src");
const url = (p: string) => pathToFileURL(path.join(SRC, p)).href;
const { obraNova, pavimentoNovo, lajeNova } = await import(url("dominio/criar.ts"));
const { gerarEstrutura } = await import(url("dominio/gerar.ts"));
const { serializarObra } = await import(url("armazenamento/arquivo.ts"));

function construir(modo: "corrigido" | "original", comMarcas = false) {
  const obra = obraNova("Teste UI resultados", "nb1-78");
  const pav = pavimentoNovo("Pavimento 1", 3, 1);
  // lajeNova nomeia pelo pavimento.lajes atual; por isso cada laje entra no pavimento antes da próxima.
  const retangulos = [
    { x: 0, y: 0, lx: 4, ly: 5 },
    { x: 4, y: 0, lx: 4, ly: 5 },
    { x: 0, y: 5, lx: 4, ly: 5 },
    { x: 4, y: 5, lx: 4, ly: 5 },
  ];
  for (const r of retangulos) pav.lajes.push(lajeNova(pav, r));
  const ptav = gerarEstrutura(pav);
  if (comMarcas) {
    // PILAR opção 6 num pilar: barras dadas nos cantos, esforços digitados. Gera a
    // marca de verificação de seção que o bloco "Marcas do motor" lista.
    const p = ptav.pilares[0];
    const dx = p.b / 2 - 3;
    const dy = p.h / 2 - 3;
    p.verificacoes = [
      {
        barras: [
          { x: -dx, y: -dy, bitola: 16 },
          { x: dx, y: -dy, bitola: 16 },
          { x: -dx, y: dy, bitola: 16 },
          { x: dx, y: dy, bitola: 16 },
        ],
        esforcos: { nk: 300, mxk: 10, myk: 5, lex: 3, ley: 3 },
      },
    ];
  }
  obra.pavimentos = [ptav];
  obra.modoCalculo = modo;
  return obra;
}

/** Geometria do r3 com carga alta (viga interrompida) e otimização parada (relação 0,35). */
function construirParadas() {
  const obra = obraNova("Teste UI paradas", "nb1-78");
  const pav = pavimentoNovo("Pavimento 1", 3, 1);
  const opc = { h: 10, revestimento: 0.1, sobrecarga: 25 };
  pav.lajes.push(lajeNova(pav, { x: 0, y: 0, lx: 6, ly: 6 }, opc));
  pav.lajes.push(lajeNova(pav, { x: 6, y: 0, lx: 1.8, ly: 6 }, opc));
  const ptav = gerarEstrutura(pav);
  obra.parametrosLaje = { relacaoNegPosMin: 0.35 };
  obra.pavimentos = [ptav];
  obra.modoCalculo = "original";
  return obra;
}

const saida = import.meta.dirname;
const casos: [string, () => ReturnType<typeof construir>][] = [
  ["corrigido", () => construir("corrigido")],
  ["original", () => construir("original")],
  ["marcas-original", () => construir("original", true)],
  ["paradas-original", construirParadas],
];
for (const [nome, fazer] of casos) {
  const obra = fazer();
  const arq = `${saida}/obra-${nome}.openstrut.json`;
  fs.writeFileSync(arq, serializarObra(obra));
  console.log(
    arq,
    "pilares:",
    obra.pavimentos[0].pilares.length,
    "vigas:",
    obra.pavimentos[0].vigas.length,
  );
}
