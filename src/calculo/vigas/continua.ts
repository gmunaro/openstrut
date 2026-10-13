// Viga contínua: esforços característicos e envoltória, comum às duas normas.
// Port de VcCaso, VcAnalisa, VcMomentoX e VcEnvMin (V1 VIGCALC.BM):
// - método dos deslocamentos com uma rotação por nó, EI constante na viga e
//   apoios verticais indeslocáveis (rótulas); o balanço de extremidade entra
//   como momento conhecido no apoio vizinho;
// - casos de carga: permanente (g e a parcela g das concentradas) em todos os
//   tramos e a variável de cada tramo sozinha (q distribuída e a parcela q das
//   concentradas do tramo); a envoltória soma ao permanente só os casos
//   desfavoráveis (sobrecarga alternada por superposição). A V1 tratava a
//   concentrada inteira como permanente, o que alivia o positivo do vão vizinho.
// Unidades: m, kN, kN/m, kN·m. Momento positivo traciona embaixo.
// Peso próprio não é somado aqui: o chamador o inclui em g (depende da norma).
import type { ComMemoria, Etapa } from "../tipos";

export interface CargaConcentrada {
  /** Distância ao apoio esquerdo do tramo, m (0 ≤ a ≤ comprimento). */
  a: number;
  /** Parcelas características, kN; para baixo > 0. g entra no caso permanente;
   *  q (padrão 0) no caso variável do tramo, alternado como a q distribuída.
   *  (O antigo `p`, tratado como permanente na V1, é o g.) */
  g: number;
  q?: number;
}

/** Força concentrada de um caso de carga. */
interface ForcaPontual {
  a: number;
  p: number;
}

export interface TramoEntrada {
  /** Vão teórico, m. */
  comprimento: number;
  /** Cargas distribuídas características, kN/m: g permanente (com peso próprio), q variável. */
  g: number;
  q: number;
  concentradas?: CargaConcentrada[];
}

export interface VigaContinuaEntrada {
  tramos: TramoEntrada[];
  /** O primeiro (último) tramo é balanço: a extremidade esquerda (direita) é livre.
   *  Os demais nós são apoios simples indeslocáveis. */
  balancoEsquerdo?: boolean;
  balancoDireito?: boolean;
}

/** Um ponto do diagrama de momentos (envoltória característica). */
export interface PontoDiagrama {
  /** Abscissa a partir do início do tramo, m. */
  x: number;
  /** Envoltória: g + q desfavorável para cima e para baixo, kN·m. */
  mMax: number;
  mMin: number;
}

export interface TramoResultado {
  comprimento: number;
  balanco: boolean;
  /** Maior momento positivo da envoltória no tramo, kN·m (≥ 0). */
  mPos: number;
  /** Momentos da envoltória nas extremidades, kN·m (≤ 0; 0 em extremidade rotulada ou livre). */
  mNegEsq: number;
  mNegDir: number;
  /** Cortantes máximos (módulo) da envoltória nas extremidades, kN. */
  vEsq: number;
  vDir: number;
  /** NPT + 1 pontos igualmente espaçados, de x = 0 a x = comprimento. */
  pontos: PontoDiagrama[];
}

export interface ApoioResultado {
  /** Extremidade livre de balanço (sem apoio, reações nulas). */
  livre: boolean;
  /** Reações características, kN (para cima > 0): só permanente; máxima (permanente + q
   *  dos tramos que aumentam a reação); g + q em todos os tramos. */
  reacaoG: number;
  reacaoMax: number;
  reacaoTotal: number;
}

export type VigaContinuaResultado =
  | (ComMemoria & { ok: true; tramos: TramoResultado[]; apoios: ApoioResultado[] })
  | (ComMemoria & { ok: false });

/** Divisões por tramo para a envoltória e o diagrama (V1 VcAnalisa: NPT = 50). */
export const NPT = 50;

const REF = "V1 VIGCALC.BM";

interface CasoTramo {
  q: number;
  conc: ForcaPontual[];
  m0: number;
  v0: number;
  mL: number;
}

const preenchido = (n: number, v: number) => Array.from({ length: n }, () => v);

const somaConc = (conc: ForcaPontual[], f: (c: ForcaPontual) => number) =>
  conc.reduce((s, c) => s + f(c), 0);

/** Momento a x m do início do tramo (V1 VcMomentoX). */
function momentoX(c: CasoTramo, x: number) {
  return c.conc.reduce(
    (m, { a, p }) => (x > a ? m - p * (x - a) : m),
    c.m0 + c.v0 * x - (c.q * x * x) / 2,
  );
}

/** Resolve K θ = rhs por eliminação de Gauss sem pivoteamento (K simétrica positiva definida). */
function resolveSistema(k: number[][], rhs: number[]) {
  const n = rhs.length;
  const a = k.map((linha) => [...linha]);
  const b = [...rhs];
  const el = (i: number, j: number) => a[i]?.[j] ?? 0;
  for (let p = 0; p < n; p++) {
    for (let i = p + 1; i < n; i++) {
      if (el(i, p) === 0) continue;
      const fator = el(i, p) / el(p, p);
      const linha = a[i] ?? [];
      for (let j = p; j < n; j++) linha[j] = el(i, j) - fator * el(p, j);
      b[i] = (b[i] ?? 0) - fator * (b[p] ?? 0);
    }
  }
  const th = preenchido(n, 0);
  for (let p = n - 1; p >= 0; p--) {
    let s = b[p] ?? 0;
    for (let j = p + 1; j < n; j++) s -= el(p, j) * (th[j] ?? 0);
    th[p] = s / el(p, p);
  }
  return th;
}

/**
 * Um caso de carga (V1 VcCaso): `acidental` = null para o permanente (g e a
 * parcela g das concentradas em todos os tramos) ou o índice do tramo que
 * recebe só a sua parcela variável (q distribuída e q das concentradas).
 */
function resolveCaso(e: VigaContinuaEntrada, acidental: number | null): CasoTramo[] {
  const n = e.tramos.length;
  const balancoEsq = (t: number) => t === 0 && e.balancoEsquerdo === true;
  const balancoDir = (t: number) => t === n - 1 && e.balancoDireito === true;
  const cargas = e.tramos.map((tr, t) => ({
    L: tr.comprimento,
    q: acidental === null ? tr.g : t === acidental ? tr.q : 0,
    conc:
      acidental === null
        ? (tr.concentradas ?? []).map((c) => ({ a: c.a, p: c.g }))
        : t === acidental
          ? (tr.concentradas ?? []).map((c) => ({ a: c.a, p: c.q ?? 0 }))
          : [],
  }));

  // uma rotação por nó extremo de tramo que não é balanço
  const dof = preenchido(n + 1, -1);
  let nd = 0;
  cargas.forEach((_, t) => {
    if (balancoEsq(t) || balancoDir(t)) return;
    if (dof[t] === -1) dof[t] = nd++;
    if (dof[t + 1] === -1) dof[t + 1] = nd++;
  });
  const k = Array.from({ length: nd }, () => preenchido(nd, 0));
  const rhs = preenchido(nd, 0);
  const soma = (i: number, j: number, v: number) => {
    const linha = k[i];
    if (linha) linha[j] = (linha[j] ?? 0) + v;
  };
  const somaRhs = (i: number, v: number) => {
    if (i >= 0) rhs[i] = (rhs[i] ?? 0) + v;
  };

  // momentos de engastamento perfeito (horário positivo na barra)
  const mab = preenchido(n, 0);
  const mba = preenchido(n, 0);
  cargas.forEach(({ L, q, conc }, t) => {
    const i = dof[t] ?? -1;
    const j = dof[t + 1] ?? -1;
    if (balancoEsq(t)) {
      mba[t] = (q * L * L) / 2 + somaConc(conc, (c) => c.p * (L - c.a));
      somaRhs(j, -(mba[t] ?? 0));
    } else if (balancoDir(t)) {
      mab[t] = -((q * L * L) / 2 + somaConc(conc, (c) => c.p * c.a));
      somaRhs(i, -(mab[t] ?? 0));
    } else {
      const fab = (-q * L * L) / 12 - somaConc(conc, (c) => (c.p * c.a * (L - c.a) ** 2) / L ** 2);
      const fba = (q * L * L) / 12 + somaConc(conc, (c) => (c.p * c.a ** 2 * (L - c.a)) / L ** 2);
      mab[t] = fab;
      mba[t] = fba;
      const kk = 2 / L;
      soma(i, i, 2 * kk);
      soma(i, j, kk);
      soma(j, i, kk);
      soma(j, j, 2 * kk);
      somaRhs(i, -fab);
      somaRhs(j, -fba);
    }
  });

  const th = resolveSistema(k, rhs);
  const rot = (t: number) => th[dof[t] ?? -1] ?? 0;

  return cargas.map(({ L, q, conc }, t) => {
    let ab = mab[t] ?? 0;
    let ba = mba[t] ?? 0;
    if (!balancoEsq(t) && !balancoDir(t)) {
      const kk = 2 / L;
      ab += kk * (2 * rot(t) + rot(t + 1));
      ba += kk * (rot(t) + 2 * rot(t + 1));
    }
    const mL = -ba;
    if (balancoEsq(t)) return { q, conc, m0: 0, v0: 0, mL };
    const v0 = (mL - ab + (q * L * L) / 2 + somaConc(conc, (c) => c.p * (L - c.a))) / L;
    return { q, conc, m0: ab, v0, mL };
  });
}

/** Valida a geometria e a estabilidade; devolve os motivos de recusa. */
function problemas(e: VigaContinuaEntrada) {
  const n = e.tramos.length;
  const erros: string[] = [];
  if (n === 0) return ["Viga sem tramos."];
  e.tramos.forEach((tr, t) => {
    if (!(tr.comprimento > 0)) erros.push(`Tramo ${t + 1}: comprimento deve ser positivo.`);
    if (![tr.g, tr.q].every(Number.isFinite)) erros.push(`Tramo ${t + 1}: carga inválida.`);
    for (const c of tr.concentradas ?? []) {
      if (![c.g, c.q ?? 0].every(Number.isFinite) || !(c.a >= 0 && c.a <= tr.comprimento))
        erros.push(`Tramo ${t + 1}: carga concentrada fora do tramo (a = ${c.a} m).`);
    }
  });
  // V1 VcCaso: pelo menos 2 apoios reais; balanço só nas extremidades (garantido pela entrada)
  const apoiosReais = n + 1 - (e.balancoEsquerdo ? 1 : 0) - (e.balancoDireito ? 1 : 0);
  if (apoiosReais < 2)
    erros.push("Viga instável: são necessários 2 apoios e balanços só nas extremidades.");
  return erros;
}

/**
 * Analisa a viga contínua (V1 VcAnalisa): envoltória de momentos e cortantes
 * por tramo e reações por apoio. Recusa (ok: false, com aviso) viga instável
 * ou com dados inválidos.
 */
export function analisaVigaContinua(e: VigaContinuaEntrada): VigaContinuaResultado {
  const erros = problemas(e);
  if (erros.length > 0) return { ok: false, avisos: erros, memoria: [] };

  const n = e.tramos.length;
  const memoria: Etapa[] = [
    {
      descricao:
        "Viga contínua pelo método dos deslocamentos (EI constante, apoios indeslocáveis); envoltória = permanente + variável de cada tramo quando desfavorável",
      ref: REF,
    },
  ];
  // caso 0 = permanente; caso t + 1 = q só no tramo t
  const casos = [resolveCaso(e, null), ...e.tramos.map((_, t) => resolveCaso(e, t))];
  const caso = (c: number, t: number) => casos[c]?.[t] ?? { q: 0, conc: [], m0: 0, v0: 0, mL: 0 };

  const tramos = e.tramos.map((tr, t): TramoResultado => {
    const L = tr.comprimento;
    // diagramas por caso nos NPT + 1 pontos (o último é o momento de extremidade)
    const mx = casos.map((_, c) =>
      Array.from({ length: NPT + 1 }, (_, k) =>
        k === NPT ? caso(c, t).mL : momentoX(caso(c, t), (L * k) / NPT),
      ),
    );
    const envoltoria = (k: number, sinal: 1 | -1) =>
      mx.reduce((m, d, c) => {
        const v = d[k] ?? 0;
        return c === 0 || v * sinal > 0 ? m + v : m;
      }, 0);
    const pontos = Array.from({ length: NPT + 1 }, (_, k) => ({
      x: (L * k) / NPT,
      mMax: envoltoria(k, 1),
      mMin: envoltoria(k, -1),
    }));
    // V1 VcEnvMin: resíduo numérico em apoio rotulado vira 0
    const negativo = (m: number) => (m > -1e-6 ? 0 : m);
    // cortantes nas extremidades por caso
    const vE = casos.map((_, c) => caso(c, t).v0);
    const vD = casos.map((_, c) => {
      const ct = caso(c, t);
      return ct.v0 - ct.q * L - somaConc(ct.conc, (cc) => cc.p);
    });
    return {
      comprimento: L,
      balanco:
        (t === 0 && e.balancoEsquerdo === true) || (t === n - 1 && e.balancoDireito === true),
      mPos: Math.max(0, ...pontos.map((p) => p.mMax)),
      mNegEsq: negativo(pontos[0]?.mMin ?? 0),
      mNegDir: negativo(pontos[NPT]?.mMin ?? 0),
      vEsq: cortanteEnvoltoria(vE),
      vDir: cortanteEnvoltoria(vD),
      pontos,
    };
  });

  // reação no nó k: cortante no início do tramo k − cortante no fim do tramo k − 1
  const apoios = Array.from({ length: n + 1 }, (_, k): ApoioResultado => {
    const porCaso = casos.map((_, c) => {
      const dir = k < n ? caso(c, k).v0 : 0;
      if (k === 0) return dir;
      const ct = caso(c, k - 1);
      const L = e.tramos[k - 1]?.comprimento ?? 0;
      return dir - (ct.v0 - ct.q * L - somaConc(ct.conc, (cc) => cc.p));
    });
    const g = porCaso[0] ?? 0;
    return {
      livre: (k === 0 && e.balancoEsquerdo === true) || (k === n && e.balancoDireito === true),
      reacaoG: g,
      reacaoMax: porCaso.slice(1).reduce((s, r) => (r > 0 ? s + r : s), g),
      reacaoTotal: porCaso.reduce((s, r) => s + r, 0),
    };
  });

  tramos.forEach((tr, t) => {
    const nome = `Tramo ${t + 1}`;
    memoria.push(
      { descricao: `${nome}: momento positivo máximo`, valor: tr.mPos, unidade: "kN·m", ref: REF },
      {
        descricao: `${nome}: momento no apoio esquerdo`,
        valor: tr.mNegEsq,
        unidade: "kN·m",
        ref: REF,
      },
      {
        descricao: `${nome}: momento no apoio direito`,
        valor: tr.mNegDir,
        unidade: "kN·m",
        ref: REF,
      },
      { descricao: `${nome}: cortante à esquerda`, valor: tr.vEsq, unidade: "kN", ref: REF },
      { descricao: `${nome}: cortante à direita`, valor: tr.vDir, unidade: "kN", ref: REF },
    );
  });
  apoios.forEach((a, k) => {
    if (a.livre) return;
    memoria.push({
      descricao: `Apoio ${k + 1}: reação máxima (g + q desfavorável)`,
      formula: "R = V início do tramo à direita − V fim do tramo à esquerda",
      valor: a.reacaoMax,
      unidade: "kN",
      ref: REF,
    });
  });
  return { ok: true, avisos: [], memoria, tramos, apoios };
}

/**
 * Cortante máximo (módulo) numa extremidade (V1 VcAnalisa): |V permanente| mais
 * |V| de cada caso de q com o mesmo sinal (ou todos, se o permanente é nulo).
 */
function cortanteEnvoltoria(vPorCaso: number[]) {
  const [vg = 0, ...vq] = vPorCaso;
  return vq.reduce(
    (s, v) => (Math.sign(v) === Math.sign(vg) || vg === 0 ? s + Math.abs(v) : s),
    Math.abs(vg),
  );
}
