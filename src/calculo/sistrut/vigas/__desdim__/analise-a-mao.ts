// Análise de viga contínua à mão para montar a entrada dos testes do DESDIM (não é
// código de produção): equação dos três momentos com as rotações de viga biapoiada
// em forma fechada, balanços como momentos conhecidos nos apoios extremos, M+ no
// ponto de cortante nulo, engastamento perfeito e envoltória das acidentais por
// superposição (xadrez por paridade), como descrito em livros_viga_pilar.md 1 e
// livros_arm_forma_des.md 4.3 (U05-002..006). Float64, constantes da entrada.
import type { AnaliseViga, DadosViga, DivisaoCarga, TramoAnalisado } from "../../base/tipos";

type Caso = { p: (d: DivisaoCarga) => number; f: (d: DivisaoCarga) => number };
const TOTAL: Caso = { p: (d) => d.p, f: (d) => d.f };
const ACIDENTAL: Caso = { p: (d) => d.pAcidental, f: (d) => d.fAcidental };

/** Trechos de carga uniforme [x1, x2] e concentradas de um tramo. */
function cargas(divisoes: readonly DivisaoCarga[], caso: Caso) {
  const faixas: { x1: number; x2: number; w: number }[] = [];
  const pontos: { a: number; P: number }[] = [];
  let anterior = 0;
  for (const d of divisoes) {
    faixas.push({ x1: anterior, x2: d.d, w: caso.p(d) });
    pontos.push({ a: d.d, P: caso.f(d) });
    anterior = d.d;
  }
  return { faixas, pontos };
}

/** Rotações (×EI) dos extremos da viga biapoiada de vão L. */
function rotacoes(L: number, divisoes: readonly DivisaoCarga[], caso: Caso) {
  const { faixas, pontos } = cargas(divisoes, caso);
  let ta = 0;
  let tb = 0;
  const fa = (u: number) => (L * L * u * u) / 2 - u ** 4 / 4;
  for (const { x1, x2, w } of faixas) {
    ta += (w / (6 * L)) * (fa(L - x1) - fa(L - x2));
    tb += (w / (6 * L)) * (fa(x2) - fa(x1));
  }
  for (const { a, P } of pontos) {
    const b = L - a;
    ta += (P * a * b * (L + b)) / (6 * L);
    tb += (P * a * b * (L + a)) / (6 * L);
  }
  return { ta, tb };
}

/** Momentos de engastamento perfeito (negativos) e carga total do tramo. */
function engastamento(L: number, divisoes: readonly DivisaoCarga[], caso: Caso) {
  const { faixas, pontos } = cargas(divisoes, caso);
  let ma = 0;
  let mb = 0;
  // ∫ w·s·(L − s)²/L² ds e ∫ w·s²·(L − s)/L² ds
  const ia = (s: number) => (L * L * s * s) / 2 - (2 * L * s ** 3) / 3 + s ** 4 / 4;
  const ib = (s: number) => (L * s ** 3) / 3 - s ** 4 / 4;
  for (const { x1, x2, w } of faixas) {
    ma -= (w * (ia(x2) - ia(x1))) / L ** 2;
    mb -= (w * (ib(x2) - ib(x1))) / L ** 2;
  }
  for (const { a, P } of pontos) {
    ma -= (P * a * (L - a) ** 2) / L ** 2;
    mb -= (P * a * a * (L - a)) / L ** 2;
  }
  return { ma, mb };
}

/** Cortante à esquerda isostático (parcela das cargas) do tramo. */
function cortanteIsostatico(L: number, divisoes: readonly DivisaoCarga[], caso: Caso) {
  const { faixas, pontos } = cargas(divisoes, caso);
  let ve = 0;
  let total = 0;
  for (const { x1, x2, w } of faixas) {
    ve += (w * (x2 - x1) * (L - (x1 + x2) / 2)) / L;
    total += w * (x2 - x1);
  }
  for (const { a, P } of pontos) {
    ve += (P * (L - a)) / L;
    total += P;
  }
  return { ve, total };
}

/** Momento que o balanço impõe ao apoio (negativo) e carga do balanço. O balanço
 *  esquerdo guarda as divisões a partir da ponta livre, com d medido do apoio
 *  (DESDIM.BAS:5880): percorre de trás para a frente. */
function balanco(divisoes: readonly DivisaoCarga[], esquerdo: boolean, caso: Caso) {
  let m = 0;
  let carga = 0;
  let anterior = 0;
  for (const d of esquerdo ? [...divisoes].reverse() : divisoes) {
    const w = caso.p(d);
    m -= ((d.d - anterior) ** 2 * w) / 2 + (d.d - anterior) * w * anterior + caso.f(d) * d.d;
    carga += (d.d - anterior) * w + caso.f(d);
    anterior = d.d;
  }
  return { m, carga };
}

/** x do cortante nulo e M+ (regra do DESCALC, DESDIM.BAS:6446): zero na parte
 *  distribuída ou sob uma concentrada; sem zero no vão, 0 e 0. */
function maximoPositivo(L: number, divisoes: readonly DivisaoCarga[], ve: number, me: number) {
  let v = ve;
  let anterior = 0;
  let x: number | undefined;
  for (const d of divisoes) {
    if (v - (d.d - anterior) * d.p <= 0) {
      x = v / d.p + anterior;
      break;
    }
    if (v - (d.d - anterior) * d.p - d.f <= 0) {
      x = d.d;
      break;
    }
    v -= (d.d - anterior) * d.p + d.f;
    anterior = d.d;
  }
  if (x === undefined || x > L || x < 0) return { x: 0, m: 0 };
  let m = me + ve * x;
  anterior = 0;
  for (const d of divisoes) {
    if (d.d >= x) {
      m -= ((x - anterior) ** 2 * d.p) / 2;
      break;
    }
    m -= ((d.d - anterior) ** 2 * d.p) / 2 + (d.d - anterior) * d.p * (x - d.d) + d.f * (x - d.d);
    anterior = d.d;
  }
  return { x, m };
}

/** Momentos nos apoios 0..n para um caso de carga, com o carregamento só nos índices
 *  do original em `carregados` (0 = balanço esquerdo, n + 1 = direito). */
function momentosApoio(viga: DadosViga, caso: Caso, carregados: (i: number) => boolean) {
  const n = viga.tramos.length;
  const m = Array.from({ length: n + 1 }, () => 0);
  if (viga.balancoEsquerdo && carregados(0))
    m[0] = balanco(viga.balancoEsquerdo.divisoes, true, caso).m;
  if (viga.balancoDireito && carregados(n + 1))
    m[n] = balanco(viga.balancoDireito.divisoes, false, caso).m;
  const rot = viga.tramos.map((t, i) =>
    carregados(i + 1) ? rotacoes(t.vao, t.divisoes, caso) : { ta: 0, tb: 0 },
  );
  // sistema tridiagonal nos apoios 1..n−1
  const k = n - 1;
  if (k > 0) {
    const a: number[][] = Array.from({ length: k }, () => Array.from({ length: k + 1 }, () => 0));
    for (let i = 1; i <= k; i++) {
      const esq = viga.tramos[i - 1]!;
      const dir = viga.tramos[i]!;
      const le = esq.vao / esq.inercia;
      const ld = dir.vao / dir.inercia;
      const linha = a[i - 1]!;
      linha[i - 1] = 2 * (le + ld);
      if (i > 1) linha[i - 2] = le;
      if (i < k) linha[i] = ld;
      let rhs = -6 * (rot[i - 1]!.tb / esq.inercia + rot[i]!.ta / dir.inercia);
      if (i === 1) rhs -= m[0]! * le;
      if (i === k) rhs -= m[n]! * ld;
      linha[k] = rhs;
    }
    for (let c = 0; c < k; c++) {
      for (let r = c + 1; r < k; r++) {
        const f = a[r]![c]! / a[c]![c]!;
        for (let j = c; j <= k; j++) a[r]![j]! -= f * a[c]![j]!;
      }
    }
    for (let r = k - 1; r >= 0; r--) {
      let s = a[r]![k]!;
      for (let j = r + 1; j < k; j++) s -= a[r]![j]! * m[j + 1]!;
      m[r + 1] = s / a[r]![r]!;
    }
  }
  return m;
}

/** Cortantes (Ve, Vd) do tramo t (1..n) para os momentos m e o caso de carga. */
function cortantes(viga: DadosViga, t: number, m: number[], caso: Caso, carregado: boolean) {
  const tr = viga.tramos[t - 1]!;
  const iso = carregado ? cortanteIsostatico(tr.vao, tr.divisoes, caso) : { ve: 0, total: 0 };
  const ve = iso.ve + (m[t]! - m[t - 1]!) / tr.vao;
  return { ve, vd: iso.total - ve };
}

/** Análise como o DESCALC a imprime (estática, envoltória "max" e engastamento
 *  perfeito), para vigas sem engaste e sem momentos externos. */
export function analiseAMao(viga: DadosViga, envoltoria: boolean): AnaliseViga {
  const n = viga.tramos.length;
  const todos = () => true;
  const mTot = momentosApoio(viga, TOTAL, todos);
  const balE = viga.balancoEsquerdo
    ? balanco(viga.balancoEsquerdo.divisoes, true, TOTAL)
    : undefined;
  const balD = viga.balancoDireito
    ? balanco(viga.balancoDireito.divisoes, false, TOTAL)
    : undefined;
  const indices = [
    ...(balE ? [0] : []),
    ...viga.tramos.map((_, i) => i + 1),
    ...(balD ? [n + 1] : []),
  ];
  // efeito da acidental de cada índice sozinho
  const ac = new Map(
    indices.map((s) => {
      const m = momentosApoio(viga, ACIDENTAL, (i) => i === s);
      const v = viga.tramos.map((_, i) => cortantes(viga, i + 1, m, ACIDENTAL, i + 1 === s));
      return [s, { m, v }] as const;
    }),
  );
  const tramos: TramoAnalisado[] = viga.tramos.map((tr, i) => {
    const t = i + 1;
    const { ve, vd } = cortantes(viga, t, mTot, TOTAL, true);
    const mp = maximoPositivo(tr.vao, tr.divisoes, ve, mTot[t - 1]!);
    const base: TramoAnalisado = { ve, vd, x: mp.x, mPositivo: mp.m, fEJ: 0 };
    if (!envoltoria) return base;
    let veMax = ve;
    let veMin = ve;
    let vdMax = vd;
    let vdMin = vd;
    let veX = ve;
    let meX = mTot[t - 1]!;
    for (const s of indices) {
      const e = ac.get(s)!;
      const c = e.v[i]!;
      if (c.ve < 0) veMax -= c.ve;
      else veMin -= c.ve;
      if (c.vd < 0) vdMax -= c.vd;
      else vdMin -= c.vd;
      if ((t + s) % 2 !== 0) {
        veX -= c.ve;
        meX -= e.m[t - 1]!;
      }
    }
    const mx = maximoPositivo(tr.vao, tr.divisoes, veX, meX);
    return {
      ...base,
      envoltoria: {
        ve: Math.abs(veMin) > veMax ? veMin : veMax,
        vd: Math.abs(vdMin) > vdMax ? vdMin : vdMax,
        x: mx.x,
        mPositivo: mx.m,
      },
    };
  });
  const apoios = mTot.map((m, k) => {
    let mMax = m;
    if (envoltoria) for (const s of indices) if (ac.get(s)!.m[k]! > 0) mMax -= ac.get(s)!.m[k]!;
    return { m, r: 0, rMax: 0, rMin: 0, mMax };
  });
  const engastamentoPerfeito = viga.tramos.flatMap((tr, i) => {
    // Extremo sem balanço nem engaste fica articulado (DESDIM.BAS:5964-5968):
    // o momento do outro lado recebe metade do engaste liberado.
    const f = engastamento(tr.vao, tr.divisoes, TOTAL);
    const articuladoE = i === 0 && !viga.balancoEsquerdo && !viga.engasteEsquerdo;
    const articuladoD = i === n - 1 && !viga.balancoDireito && !viga.engasteDireito;
    const ma = articuladoE ? 0 : articuladoD ? f.ma + f.mb / 2 : f.ma;
    const mb = articuladoD ? 0 : articuladoE ? f.mb + f.ma / 2 : f.mb;
    const ve = cortanteIsostatico(tr.vao, tr.divisoes, TOTAL).ve + (mb - ma) / tr.vao;
    const mp = maximoPositivo(tr.vao, tr.divisoes, ve, ma);
    return mp.m > tramos[i]!.mPositivo * 1.01
      ? [{ tramo: i + 1, mPositivo: mp.m, mEsquerdo: ma, mDireito: mb }]
      : [];
  });
  return {
    nome: viga.nome,
    apoios,
    tramos,
    ...(balE ? { balancoEsquerdo: { mApoio: balE.m, carga: balE.carga } } : {}),
    ...(balD ? { balancoDireito: { mApoio: balD.m, carga: balD.carga } } : {}),
    somaReacoes: 0,
    mepEsquerdo: 0,
    mepDireito: 0,
    momentosPilar: [0, 0],
    engastamentoPerfeito,
    avisos: [],
    memoria: [],
  };
}
