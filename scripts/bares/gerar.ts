// Gera src/calculo/normas/nbr6118-2023/tabelasBares.ts.
// Uso: bun scripts/bares/gerar.ts   (determinístico; leva alguns segundos)
// Método e convenções: tabela.ts, placas.ts e reacoes.ts, e
// docs/norma/bares-reacoes-flechas.md.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { NU, ORDEM, TERMOS, TIPOS, tabelaTipo } from "./tabela";

const raiz = path.resolve(import.meta.dirname, "../..");
const destino = path.join(raiz, "src/calculo/normas/nbr6118-2023/tabelasBares.ts");

const cabecalho = `// ARQUIVO GERADO por scripts/bares/gerar.ts (bun scripts/bares/gerar.ts).
// Não edite à mão: mude o gerador e rode de novo.
//
// Coeficientes das lajes retangulares maciças com carga uniforme e bordos
// apoiados ou engastados, nos tipos 1 a 6 da numeração de Bares/Pinheiro que o
// motor usa. Os números são calculados pelo gerador, não transcritos de tabela
// publicada. Não são texto da NBR 6118 [NÃO NORMATIVO]: a análise elástica por
// tabelas é a escolha do app (docs/SPEC.md).
// - Momentos e flecha: teoria de placas delgadas (Kirchhoff), placa isótropa,
//   ν = ${String(NU).replace(".", ",")}, pelo método da superposição de Timoshenko & Woinowsky-Krieger
//   (placa apoiada + momentos de bordo em série de Lévy nos engastes, ${TERMOS} termos
//   por bordo; scripts/bares/placas.ts). μx, μy no centro da placa; μ'x, μ'y o
//   maior valor ao longo do bordo engastado; α a flecha no centro.
// - Reações: processo das áreas (NBR 6118 14.7.6.1; 45° entre bordos iguais, 60°
//   a partir do engastado), com metade do alívio no bordo apoiado oposto a um
//   engastado (scripts/bares/reacoes.ts). Por isso a soma das reações dos tipos
//   assimétricos passa da carga total.
// - Linha "> 2,00": na direção x, a faixa de 1 m como viga vinculada pelos
//   x-bordos (pl²/8, 9pl²/128, pl²/24; −pl²/8, −pl²/12; reações 1/2, 5/8 e
//   3/8 + metade do alívio = 7/16; flecha de viga, sem 1 − ν²); na direção y,
//   repete λ = 2,00.
//
// Convenção: lx é o vão horizontal do desenho e o MENOR vão; ly o vertical,
// λ = ly/lx ≥ 1. "x-bordos" são os perpendiculares a lx (esquerdo e direito) e
// "y-bordos" os perpendiculares a ly (inferior e superior). Cada tipo é a
// quantidade de bordos engastados (nx, ny): 1 (0,0), 2A (0,1), 2B (1,0),
// 3 (1,1), 4A (0,2), 4B (2,0), 5A (1,2), 5B (2,1), 6 (2,2).
//
// Cada coluna tem 22 posições: λ = 1,00 a 2,00 de 0,05 em 0,05 e, na última,
// a linha "> 2,00".
// - mx, my (μx, μy): positivos; mxNeg, myNeg (μ'x, μ'y): negativos nos bordos
//   engastados, em módulo. M = μ · p · lx² / 100.
// - vx, vy (νx, νy): reação nos bordos apoiados; vxNeg, vyNeg (ν'x, ν'y): nos
//   engastados. V = ν · p · lx / 10.
// - alfa (α): flecha no centro, a = α · p · lx⁴ / (1200 · EI), EI da faixa de 1 m.
`;

const corpo = TIPOS.map((t) => {
  const cols = tabelaTipo(t);
  const linhas = ORDEM.filter((n) => cols[n] !== undefined).map(
    (n) => `    ${n}: [${cols[n]!.join(", ")}],`,
  );
  return `  "${t}": {\n${linhas.join("\n")}\n  },`;
}).join("\n");

const arquivo = `${cabecalho}
export type TipoBares = ${TIPOS.map((t) => `"${t}"`).join(" | ")};

export interface ColunasBares {
  mx: readonly number[];
  my: readonly number[];
  mxNeg?: readonly number[];
  myNeg?: readonly number[];
  vx?: readonly number[];
  vy?: readonly number[];
  vxNeg?: readonly number[];
  vyNeg?: readonly number[];
  alfa: readonly number[];
}

/** Células fora da tendência das vizinhas, que quem interpola sobre elas avisa
 *  (lajes.ts). Vazia: a tabela é calculada, sem erros de transcrição. */
export const CELULAS_SUSPEITAS: ReadonlyArray<{
  tipo: TipoBares;
  coluna: keyof ColunasBares;
  lambda: number;
  valor: number;
}> = [];

export const BARES: Record<TipoBares, ColunasBares> = {
${corpo}
};
`;

writeFileSync(destino, arquivo);
execFileSync(path.join(raiz, "node_modules/.bin/oxfmt"), [destino], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
console.log(`gravado ${path.relative(raiz, destino)}`);
