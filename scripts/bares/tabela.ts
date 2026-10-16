// Calcula os coeficientes das lajes retangulares (tipos 1 a 6) que o motor da
// NBR 6118 usa, a partir da teoria de placas (placas.ts) e do processo das
// áreas (reacoes.ts). gerar.ts grava o resultado em
// src/calculo/normas/nbr6118-2023/tabelasBares.ts.
//
// Convenções (as mesmas das tabelas de Bares adaptadas por Pinheiro, que o
// motor usava): lx é o vão horizontal e o menor, ly = λ·lx; x-bordos são os
// perpendiculares a lx (E e D), y-bordos os perpendiculares a ly (I e S).
// - μx, μy: momentos positivos no CENTRO da placa; μ'x, μ'y: maior valor
//   absoluto do momento ao longo do bordo engastado. M = μ p lx²/100.
// - α: flecha no centro, a = α p lx⁴ / (1200 EI), EI da faixa de 1 m
//   (E h³/12); como a placa tem rigidez D = EI/(1 − ν²), α = 1200 (1 − ν²) w D/(p lx⁴).
// - ν (reações): V = ν p lx / 10, processo das áreas com metade do alívio.
// - Linhas λ = 1,00 a 2,00 (passo 0,05) e a 22ª, "> 2,00": na direção x, a
//   faixa de 1 m como viga (vinculada pelos x-bordos); na direção y, repete λ = 2.

import { resolvePlaca, type BordoPlaca } from "./placas";
import { coeficientesReacao } from "./reacoes";

/** Coeficiente de Poisson: o que reproduz as tabelas de Bares/Pinheiro (docs/norma/bares-reacoes-flechas.md 3.2). */
export const NU = 0.15;
/** Termos das séries de momento de bordo (convergido a 10⁻⁴ em μ; ver o teste). */
export const TERMOS = 100;

/** Tipos na ordem da tabela (Object.keys poria "1", "3" e "6" na frente, por serem números). */
export const TIPOS = ["1", "2A", "2B", "3", "4A", "4B", "5A", "5B", "6"] as const;
export type TipoLaje = (typeof TIPOS)[number];

/** Bordos engastados de cada tipo, na orientação da tabela. */
export const ENGASTES: Record<TipoLaje, readonly BordoPlaca[]> = {
  "1": [],
  "2A": ["I"],
  "2B": ["D"],
  "3": ["D", "I"],
  "4A": ["I", "S"],
  "4B": ["E", "D"],
  "5A": ["D", "I", "S"],
  "5B": ["E", "D", "I"],
  "6": ["E", "D", "I", "S"],
};

export const LAMBDAS = Array.from({ length: 21 }, (_, i) => 1 + i * 0.05);

export interface Coeficientes {
  mx: number;
  my: number;
  mxNeg?: number;
  myNeg?: number;
  vx?: number;
  vy?: number;
  vxNeg?: number;
  vyNeg?: number;
  alfa: number;
}

/** Maior −f(s) em 0 < s < L: varredura e refinamento por seção áurea. */
function maiorNegativo(f: (s: number) => number, L: number) {
  const n = 200;
  let melhor = 1;
  for (let i = 2; i < n; i++) if (f((i * L) / n) < f((melhor * L) / n)) melhor = i;
  let lo = ((melhor - 1) * L) / n;
  let hi = ((melhor + 1) * L) / n;
  const g = (Math.sqrt(5) - 1) / 2;
  while (hi - lo > 1e-9 * L) {
    const c = hi - g * (hi - lo);
    const d = lo + g * (hi - lo);
    if (f(c) < f(d)) hi = d;
    else lo = c;
  }
  return -f((lo + hi) / 2);
}

/** Coeficientes da placa do tipo dado com lx = 1 e ly = λ (sem arredondar). */
export function coeficientesPlaca(tipo: TipoLaje, lambda: number, termos = TERMOS, nu = NU) {
  const eng = ENGASTES[tipo];
  const placa = resolvePlaca({ a: 1, b: lambda, nu, engastados: eng, termos });
  const c = placa.campo(0.5, lambda / 2);
  const r = coeficientesReacao(lambda, eng);
  const bordoX = eng.find((e) => e === "E" || e === "D");
  const bordoY = eng.find((e) => e === "I" || e === "S");
  const out: Coeficientes = { mx: 100 * c.mx, my: 100 * c.my, alfa: 1200 * (1 - nu * nu) * c.w };
  if (bordoX) out.mxNeg = 100 * maiorNegativo((s) => placa.momentoBordo(bordoX, s), lambda);
  if (bordoY) out.myNeg = 100 * maiorNegativo((s) => placa.momentoBordo(bordoY, s), 1);
  // reações: um valor por coluna (os bordos opostos de mesmo tipo são iguais)
  for (const [e, d, ap, en] of [
    ["E", "D", "vx", "vxNeg"],
    ["I", "S", "vy", "vyNeg"],
  ] as const) {
    if (!eng.includes(e) || !eng.includes(d)) out[ap] = eng.includes(e) ? r[d] : r[e];
    if (eng.includes(e) || eng.includes(d)) out[en] = eng.includes(e) ? r[e] : r[d];
  }
  return out;
}

/** Flecha máxima da viga apoiada-engastada sob carga uniforme, em q l⁴/EI. */
function flechaApoiadaEngastada() {
  // w(x) = (l³x − 3l x³ + 2x⁴)/48 com l = 1 (x a partir do apoio); w' = 0 em x = (1 + √33)/16
  const x = (1 + Math.sqrt(33)) / 16;
  return (x - 3 * x ** 3 + 2 * x ** 4) / 48;
}

/**
 * Linha "> 2,00" na direção x: faixa de 1 m vinculada pelos x-bordos, como viga
 * (sem o fator 1 − ν²), com metade do alívio no apoio da faixa apoiada-engastada.
 */
export function coeficientesFaixa(nEngastesX: 0 | 1 | 2) {
  const faixas = {
    0: { mx: 100 / 8, alfa: (1200 * 5) / 384, vx: 5 },
    1: {
      mx: (100 * 9) / 128,
      mxNeg: 100 / 8,
      alfa: 1200 * flechaApoiadaEngastada(),
      vx: 10 * (3 / 8 + (5 / 8 - 3 / 8) / 4),
      vxNeg: 10 * (5 / 8),
    },
    2: { mx: 100 / 24, mxNeg: 100 / 12, alfa: 1200 / 384, vxNeg: 5 },
  } as const;
  return faixas[nEngastesX];
}

export type Colunas = Record<keyof Coeficientes, number[]>;

/** Ordem das colunas no arquivo gerado. */
export const ORDEM = ["mx", "my", "mxNeg", "myNeg", "vx", "vy", "vxNeg", "vyNeg", "alfa"] as const;

/** Tabela completa de um tipo: 21 linhas de λ mais a linha "> 2,00", arredondadas a 0,01. */
export function tabelaTipo(tipo: TipoLaje): Partial<Colunas> {
  const linhas = LAMBDAS.map((l) => coeficientesPlaca(tipo, l));
  const faixa: Partial<Coeficientes> = coeficientesFaixa(
    ENGASTES[tipo].filter((e) => e === "E" || e === "D").length as 0 | 1 | 2,
  );
  const ultima = linhas[linhas.length - 1]!;
  const colunas: Partial<Colunas> = {};
  for (const nome of ORDEM) {
    if (ultima[nome] === undefined) continue;
    const ehX = nome === "mx" || nome === "mxNeg" || nome === "vx" || nome === "vxNeg";
    const acima = nome === "alfa" || ehX ? faixa[nome] : ultima[nome];
    if (acima === undefined) throw new Error(`faixa sem ${nome} no tipo ${tipo}`);
    colunas[nome] = [...linhas.map((l) => l[nome]!), acima].map(arredonda);
  }
  return colunas;
}

/** Arredonda a 2 casas (meio para cima, como a impressão das tabelas). */
export const arredonda = (v: number) => Math.round(v * 100 + 1e-9) / 100;
