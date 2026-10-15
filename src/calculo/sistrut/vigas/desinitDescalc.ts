// Análise da viga como o DESDIM a refaz antes de dimensionar e detalhar: porte do
// DESCALC (S_50141, DESDIM.BAS:5777-6582). Método dos focos com as cargas totais,
// redução dos negativos, esforços de engastamento perfeito, envoltória das acidentais
// (xadrez por paridade, U05-004), M+ no ponto de cortante nulo e alívio do cortante junto
// ao apoio (L_5602E, U05-007). Grava no COMMON os arrays que o DESAUXDI e o DESINIT leem
// (A_16DE, A_170C, A_1654, A_1796, A_17C4, A_1768, A_1626, A_1540, A_11A8/A_11D6/A_1204).
//
// O DESDIM analisa a viga de novo a partir do .VIG (DESDIM.BAS:795, CALL S_50141 antes
// de CALL S_113F7): o dimensionamento (`desdim.ts`) e o detalhamento (`desinit.ts`)
// usam estes valores, em SINGLE. `analisaDescalc` carrega o COMMON e roda o DESCALC.
// Porte linha a linha; nomes = endereços do original (ver `desinitComum.ts`).
import { AREAS_DSP_CORRIGIDAS } from "../base/parametros";
import { qbCint, qbInt, qbStr } from "../base/f32";
import type { EntradaDesdim, ModoSistrut } from "../base/tipos";
import { Comum, M1, M2, qb } from "./desinitComum";

/** COMMON da viga depois do DESCALC, como o DESDIM o tem ao entrar no dimensionamento
 *  (S_113F7): .VIG, .SEC e .DSP carregados (DESDIM.BAS:4622-4932, DESENHO.BAS:
 *  4773-5035), DESCALC rodado e a seção do balanço sem seção própria completada com a
 *  do apoio vizinho (DESDIM.BAS:2917-2929; o DESCALC roda antes e vê a do .SEC). A
 *  forma (.FOR) e o dimensionamento entram depois, no detalhamento (`montaComum`). */
export function analisaDescalc(entrada: EntradaDesdim, modo: ModoSistrut) {
  const c = new Comum(modo);
  const { viga, secoes, materiais, parametros: p } = entrada;
  const n = viga.tramos.length;
  c.v0ddc = n;
  c.v0de0 = viga.balancoEsquerdo ? 1 : 0;
  c.v0de4 = viga.balancoDireito ? 1 : 0;
  c.v0de8 = viga.engasteEsquerdo ? 1 : 0;
  c.v0dec = viga.engasteDireito ? 1 : 0;
  c.v0e70 = p.acidentaisEnvoltoria ? "S" : "N";
  c.v0e74 = p.momentosExternos ? "S" : "N";
  c.a1148.p(0, viga.momentosExternos[0]);
  c.a1148.p(1, viga.momentosExternos[1]);

  // tramos do original 0..n+1 (0 e n+1 = balanços)
  const tramoDoOriginal = (t: number) =>
    t === 0 ? viga.balancoEsquerdo : t === n + 1 ? viga.balancoDireito : viga.tramos[t - 1];
  let div = 0;
  for (let t = 0; t <= n + 1; t++) {
    const tr = tramoDoOriginal(t);
    const lista = tr?.divisoes ?? [];
    c.a0faa.p(t, lista.length);
    for (const d of lista) {
      div += 1;
      c.a1062.p(div, d.p);
      c.a1090.p(div, d.pAcidental);
      c.a10be.p(div, d.d);
      c.a10ec.p(div, d.f);
      c.a111a.p(div, d.fAcidental);
    }
    c.a0fd8.p(t, div);
    c.a1006.p(t, tr?.vao ?? 0);
  }

  for (let t = 0; t <= n + 1; t++) c.a1034.p(t, tramoDoOriginal(t)?.inercia ?? 0);

  // seções (.SEC)
  for (let k = 0; k <= n; k++) {
    c.a1260.p(k, 0, secoes.apoios[k]?.bw ?? 0);
    c.a1260.p(k, 1, secoes.apoios[k]?.hw ?? 0);
  }
  for (let t = 0; t <= n + 1; t++) {
    const sec =
      t === 0 ? secoes.balancoEsquerdo : t === n + 1 ? secoes.balancoDireito : secoes.tramos[t - 1];
    if (!sec) continue;
    c.a1232.p(t, 0, sec.bw);
    c.a1232.p(t, 1, sec.hw);
    c.a1232.p(t, 2, sec.bf);
    c.a1232.p(t, 3, sec.hf);
  }

  // .DSP e materiais (DESENHO.BAS:4773-5035)
  c.v0eba = c.s(materiais.fck);
  c.v0ebe = c.s(materiais.fyk);
  c.v0ec2 = materiais.classeAco;
  c.v0ec6 = c.s(p.multiplicadorUnidade);
  c.v0f5e = c.s(materiais.gamaC);
  c.v0f62 = c.s(materiais.gamaF);
  c.v0f66 = c.s(materiais.gamaS);
  c.v0eaa = c.s(p.cobrimento);
  c.v0ea6 = c.s(c.v0eaa + c.s(p.acrescimo));
  for (const [i, b] of p.bitolas.entries()) {
    c.bitola.p(i, b.bitola);
    let area = b.area;
    // R9 (dado do .DSP): a área do φ32 vale também no detalhamento (φ4 fica 0)
    if (modo === "corrigido" && area === 0 && b.bitola === 32) area = AREAS_DSP_CORRIGIDAS[32];
    c.area.p(i, area);
    c.a1488.p(i, b.kgPorM);
  }
  c.v0f46 = p.gruposBitolas;
  [c.v0f4a, c.v0f4e, c.v0f52, c.v0f56, c.v0f5a] = p.limitesIntervalos.map((x) => c.s(x)) as [
    number,
    number,
    number,
    number,
    number,
  ];
  for (const [g, linha] of p.grupoDeCorte.entries()) {
    for (const [i, v] of linha.entries()) c.a14e4.p(i, g, v);
  }
  c.v0f3e = c.s(p.larguraEstriboSimples);
  c.v0f42 = c.s(p.larguraEstriboDuplo);
  for (const [i, b] of p.bitolasEstribo.entries()) {
    c.a142c.p(i, 0, b.minima);
    c.a142c.p(i, 1, b.maxima);
  }
  for (const [i, linha] of p.dobrasPorBitola.entries()) {
    for (const [j, v] of linha.entries()) c.a1c62.p(i, j, v);
  }
  for (const [i, v] of p.tabelaBitola1.entries()) c.a1d1a.p(i, v);
  for (const [i, v] of p.tabelaBitola2.entries()) c.a1d48.p(i, v);
  c.v18a2 = c.s(p.taxaArmaduraMinima);
  c.v18a6 = c.s(p.decalagem);
  c.v18aa = c.s(p.ancoragemPositiva);
  c.v18ae = c.s(p.ancoragemNegativa);
  c.v188a = p.ancoragemMinimo10Diametros ? "S" : "N";
  c.v189e = c.s(p.taxaEstriboMinima);
  c.v18be = c.s(p.espacamentoEstriboMinimo);
  c.v18c2 = c.s(p.espacamentoEstriboMaximo);
  c.v18c6 = p.comparaEspacamentoMaximo === "d/2" ? 0 : 1;
  c.v1906 = p.espacamentosEstribo.map((x) => `${qbStr(x).trim()}/`).join(" ");
  c.v190a = p.portaEstribosAutomaticos ? "S" : "N";
  c.v18da = c.s(p.ordemMinimaPortaEstribo);
  c.v18de = c.s(p.traspassePortaEstribo);
  c.v190e = p.comprimentoDesenvolvido ? "S" : "N";
  c.v18ca = c.s(p.raioDobramento);
  c.v18b2 = c.s(p.taxaMinimaNegativa);
  c.v18ce = c.s(p.alturaArmaduraPele);
  c.v18b6 = c.s(p.taxaArmaduraPele);
  c.v18e2 = c.s(p.traspassePele);
  c.v18ee = c.s(p.distanciaMinimaEstribosExtremidade);
  c.v18d2 = c.s(p.entradaMinimaApoio);
  c.v1912 = p.verificaGrampos ? "S" : "N";
  c.v1916 = p.reduzAncoragemPositiva ? "S" : "N";
  c.v18d6 = c.s(p.ordemMaximaCA60);
  c.v187e = c.s(p.comprimentoMaximoBarra);

  c.v0df4 = c.s(p.reducaoNegativos);
  c.v182e = p.alivioCortante ? "S" : "N";

  descalc(c);
  for (let t = 1 - c.v0de0; t <= n + c.v0de4; t++) {
    if ((c.a1232.g(t, 1) <= 0 || c.a1232.g(t, 0) <= 0) && (t === n + 1 || t === 0)) {
      c.a1232.p(t, 0, c.a1260.g(Math.max(0, t - 1), 0));
      c.a1232.p(t, 1, c.a1260.g(Math.max(0, t - 1), 1));
    }
  }
  return c;
}

/** Arrays locais do DESCALC que a impressão usa: reação (L_BP4A), reação máxima e mínima
 *  (L_BP60) e momentos de engastamento perfeito dos apoios extremos (L_BP38). */
export interface LocaisDescalc {
  reacao: M1;
  reacaoEnvoltoria: M2;
  mep: M1;
}

/** Abscissa do cortante nulo (V_0E30) e M+ (V_0E2C) a partir de Ve = V_0E38 e do M do
 *  apoio esquerdo = V_0E2C, no tramo `t` (L_55A83, DESDIM.BAS:6449-6510). Usa A_1062(0)
 *  como rascunho, como o original. */
function momentoPositivo(c: Comum, t: number) {
  const s = c.s;
  c.a1062.p(0, c.v0e38);
  let l22 = 0;
  c.v0e30 = 0;
  const ini = 1 + (c.a0fd8.g(t) - c.a0faa.g(t));
  const fim = c.a0fd8.g(t);
  let i = ini;
  for (; i <= fim; i++) {
    const d = c.a10be.g(i);
    if (c.v0e38 - (d - l22) * c.a1062.g(i) <= 0) {
      c.v0e30 = 1;
      break;
    }
    if (c.v0e38 - (d - l22) * c.a1062.g(i) - c.a10ec.g(i) <= 0) {
      c.v0e30 = 2;
      break;
    }
    c.v0e38 = s(c.v0e38 - (d - l22) * c.a1062.g(i) - c.a10ec.g(i));
    l22 = d;
  }
  if (c.v0e30 === 1) c.v0e30 = s(c.v0e38 / c.a1062.g(i) + l22);
  else if (c.v0e30 === 2) c.v0e30 = c.a10be.g(i);
  else {
    c.v0e30 = 0;
    c.v0e2c = 0;
    return;
  }
  if (c.a1006.g(t) < c.v0e30 || c.v0e30 < 0) {
    c.v0e30 = 0;
    c.v0e2c = 0;
    return;
  }
  c.v0e38 = c.a1062.g(0);
  l22 = 0;
  c.v0e2c = s(c.v0e38 * c.v0e30 + c.v0e2c);
  c.v0e38 = 0;
  i = ini;
  for (; i <= fim; i++) {
    const d = c.a10be.g(i);
    if (d >= c.v0e30) {
      c.v0e38 = 1;
      break;
    }
    c.v0e2c = s(c.v0e2c - ((d - l22) ** 2 * c.a1062.g(i)) / 2);
    c.v0e2c = s(c.v0e2c - (d - l22) * c.a1062.g(i) * (c.v0e30 - d));
    c.v0e2c = s(c.v0e2c - (c.v0e30 - d) * c.a10ec.g(i));
    l22 = d;
  }
  if (c.v0e38 !== 1) {
    c.v0e2c = 0;
    return;
  }
  c.v0e2c = s(c.v0e2c - ((c.v0e30 - l22) ** 2 * c.a1062.g(i)) / 2);
}

/** Termos de carga do tramo t (reações isostáticas e os termos dos focos L_BP96/L_BPA8)
 *  com p e F (`p`, `f`) ou só as acidentais (DESDIM.BAS:5845-5870 e 6064-6082). */
function termosDoTramo(
  c: Comum,
  t: number,
  p: M1,
  f: M1,
  ve: (t: number, v: number) => void,
  vd: (t: number, v: number) => void,
  ve0: (t: number) => number,
  vd0: (t: number) => number,
  bp96: M1,
  bpa8: M1,
) {
  let l22 = 0;
  const fim = c.a0fd8.g(t);
  for (let i = 1 + (c.a0fd8.g(t) - c.a0faa.g(t)); i <= fim; i++) {
    const d = c.a10be.g(i);
    const l = c.a1006.g(t);
    ve(t, ((d - l22) * p.g(i) * (l - (d + l22) / 2)) / l + ve0(t));
    vd(t, ((d - l22) * p.g(i) * (d + l22)) / (l * 2) + vd0(t));
    bp96.p(
      t,
      ((d ** 2 * (l * 2 - d) ** 2 - l22 ** 2 * (l * 2 - l22) ** 2) * p.g(i)) / (l ** 2 * 4) +
        bp96.g(t),
    );
    bpa8.p(
      t,
      ((d ** 2 * (l ** 2 * 2 - d ** 2) - l22 ** 2 * (l ** 2 * 2 - l22 ** 2)) * p.g(i)) /
        (l ** 2 * 4) +
        bpa8.g(t),
    );
    ve(t, ((l - d) * f.g(i)) / l + ve0(t));
    vd(t, (d * f.g(i)) / l + vd0(t));
    bp96.p(t, (f.g(i) * d * (l - d) * (l * 2 - d)) / l ** 2 + bp96.g(t));
    bpa8.p(t, (f.g(i) * d * (l - d) * (l + d)) / l ** 2 + bpa8.g(t));
    l22 = d;
  }
}

/** Momento no apoio e carga total de um balanço (DESDIM.BAS:5885-5904 e 6100-6125). */
function balanco(
  c: Comum,
  divisoes: number[],
  p: M1,
  f: M1,
  m: () => number,
  setM: (v: number) => void,
  soma: () => number,
  setSoma: (v: number) => void,
) {
  let l22 = 0;
  for (const i of divisoes) {
    const d = c.a10be.g(i);
    setM(m() - ((d - l22) ** 2 * p.g(i)) / 2 - (d - l22) * p.g(i) * l22 - f.g(i) * d);
    setSoma((d - l22) * p.g(i) + soma() + f.g(i));
    l22 = d;
  }
}

/** Fatores de foco (L_BP72 da esquerda, L_BP84 da direita) (DESDIM.BAS:5900-5918). */
function focos(c: Comum, bp72: M1, bp84: M1) {
  const n = c.v0ddc;
  if (n === 1) return;
  for (let t = 2; t <= n; t++) {
    bp72.p(
      t,
      1 /
        ((c.a1006.g(t - 1) * c.a1034.g(t) * (2 - bp72.g(t - 1))) /
          (c.a1034.g(t - 1) * c.a1006.g(t)) +
          2),
    );
  }
  for (let t = n - 1; t >= 1; t--) {
    bp84.p(
      t,
      1 /
        ((c.a1006.g(t + 1) * c.a1034.g(t) * (2 - bp84.g(t + 1))) /
          (c.a1034.g(t + 1) * c.a1006.g(t)) +
          2),
    );
  }
}

/** DESCALC: análise, engastamento perfeito, envoltória e alívio do cortante. */
export function descalc(c: Comum): LocaisDescalc {
  const s = c.s;
  const n = c.v0ddc;
  const bp72 = new M1(s, 14);
  const bp84 = new M1(s, 14);
  let bp96 = new M1(s, 13);
  let bpa8 = new M1(s, 13);
  const bp38 = new M1(s, 2);
  const bp4a = new M1(s, 13);
  const bp60 = new M2(s, 13, 2);
  const a15ca = c.a15ca;
  const extSemAcid = c.v0e74 === "S" && c.v0e70 === "N";

  for (let t = 1; t <= n; t++) {
    c.a1654.p(t, 0, 0);
    c.a1654.p(t, 1, 0);
    bp96.p(t, 0);
    bpa8.p(t, 0);
    if (c.a0faa.g(t) === 0) continue;
    termosDoTramo(
      c,
      t,
      c.a1062,
      c.a10ec,
      (t, v) => c.a1654.p(t, 0, v),
      (t, v) => c.a1654.p(t, 1, v),
      (t) => c.a1654.g(t, 0),
      (t) => c.a1654.g(t, 1),
      bp96,
      bpa8,
    );
  }
  a15ca.p(0, 0);
  a15ca.p(n, 0);
  c.a1654.p(0, 1, 0);
  c.a1654.p(n + 1, 0, 0);
  c.a1626.p(0, 0);
  c.a1626.p(n + 1, 0);
  c.a1654.p(0, 0, 0);
  c.a1654.p(n + 1, 1, 0);
  const divisoesBalE = () => {
    const r: number[] = [];
    for (let i = c.a0fd8.g(0); i >= 1; i--) r.push(i);
    return r;
  };
  const divisoesBalD = () => {
    const r: number[] = [];
    for (let i = 1 + c.a0fd8.g(n); i <= c.a0fd8.g(n + 1); i++) r.push(i);
    return r;
  };
  if (c.v0de0 !== 0 && c.a0faa.g(0) !== 0) {
    balanco(
      c,
      divisoesBalE(),
      c.a1062,
      c.a10ec,
      () => a15ca.g(0),
      (v) => a15ca.p(0, v),
      () => c.a1654.g(0, 1),
      (v) => c.a1654.p(0, 1, v),
    );
  }
  if (c.v0de4 !== 0 && c.a0faa.g(n + 1) !== 0) {
    balanco(
      c,
      divisoesBalD(),
      c.a1062,
      c.a10ec,
      () => a15ca.g(n),
      (v) => a15ca.p(n, v),
      () => c.a1654.g(n + 1, 0),
      (v) => c.a1654.p(n + 1, 0, v),
    );
  }
  // método dos focos (DESDIM.BAS:5899-5954)
  bp72.p(1, c.v0de8 === 0 ? 0 : 0.5);
  bp84.p(n, c.v0dec === 0 ? 0 : 0.5);
  focos(c, bp72, bp84);
  if (extSemAcid) a15ca.p(0, a15ca.g(0) + c.a1148.g(0));
  if (!(c.v0dec === 0 && n === 1)) {
    for (let t = 1; t <= qbCint(n - 1 + c.v0dec); t++) {
      a15ca.p(t, ((bp72.g(t) * bp96.g(t) - bpa8.g(t)) * bp84.g(t)) / (1 - bp84.g(t) * bp72.g(t)));
      a15ca.p(t, a15ca.g(t) - bp84.g(t) * a15ca.g(t - 1));
    }
  }
  if (extSemAcid) a15ca.p(n, a15ca.g(n) + c.a1148.g(1));
  c.v0e2c = a15ca.g(n);
  if (c.v0dec === 1) c.v0e2c = s(-qb(extSemAcid) * c.a1148.g(1));
  if (!(c.v0de8 === 0 && n === 1)) {
    for (let t = n; t >= qbCint(2 - c.v0de8); t--) {
      c.v0e30 = s(((bp84.g(t) * bpa8.g(t) - bp96.g(t)) * bp72.g(t)) / (1 - bp84.g(t) * bp72.g(t)));
      a15ca.p(t - 1, c.v0e30 - bp72.g(t) * c.v0e2c + a15ca.g(t - 1));
      c.v0e2c = s(c.v0e30 - bp72.g(t) * c.v0e2c);
    }
  }
  if (1 - c.v0de8 <= n - 1 + c.v0dec) {
    for (let t = qbCint(1 - c.v0de8); t <= qbCint(n - 1 + c.v0dec); t++)
      a15ca.p(t, a15ca.g(t) * c.v0df4);
  }

  // engastamento perfeito e M+ (DESDIM.BAS:5959-6006)
  c.v1176 = 0;
  c.v0e20 = 1;
  for (let t = 1; t <= n; t++) {
    const e = c.v0de8 === 0 && c.v0de0 === 0 && t === 1 ? 0 : 1;
    const d = c.v0dec === 0 && c.v0de4 === 0 && t === n ? 0 : 1;
    const l = c.a1006.g(t);
    const r = c.v0e20;
    c.v0e2c = s(-(((e + d) * bp96.g(t) * e - bpa8.g(t) * e * d) / (e + d + 1)));
    c.a1204.p(r, 0, ((bp96.g(t) * e - bpa8.g(t) * d) * (e + d)) / (l * 2) + c.a1654.g(t, 0));
    if (extSemAcid) {
      if (t === 1) {
        c.v0e2c = s(c.a1148.g(0) + c.v0e2c);
        c.a1204.p(
          r,
          0,
          ((qb(d === 0) + (qb(d === 1) * 3) / 2) * c.a1148.g(0)) / l + c.a1204.g(r, 0),
        );
      }
      if (t === n) {
        if (t > 1) c.v0e2c = s(c.v0e2c - c.a1148.g(1) / 2);
        c.a1204.p(
          r,
          0,
          c.a1204.g(r, 0) - ((qb(e === 0) + (qb(e === 1) * 3) / 2) * c.a1148.g(1)) / l,
        );
      }
    }
    c.v0e38 = c.a1204.g(r, 0);
    if (t === 1) bp38.p(0, -((bp96.g(t) * 2 - bpa8.g(t)) / 3));
    if (t === n) bp38.p(1, -((bpa8.g(t) * 2 - bp96.g(t)) / 3));
    momentoPositivo(c, t);
    c.a11d6.p(r, t);
    c.a117a.p(r, c.v0e30);
    c.a11a8.p(r, c.v0e2c);
    c.a1204.p(r, 1, c.a1654.g(t, 1) - c.a1204.g(r, 0) + c.a1654.g(t, 0));
    c.v0e2c = a15ca.g(t - 1);
    c.a1654.p(t, 0, (a15ca.g(t) - a15ca.g(t - 1)) / l + c.a1654.g(t, 0));
    c.a1654.p(t, 1, (a15ca.g(t - 1) - a15ca.g(t)) / l + c.a1654.g(t, 1));
    c.v0e38 = c.a1654.g(t, 0);
    momentoPositivo(c, t);
    c.a15f8.p(t, c.v0e30);
    c.a1626.p(t, c.v0e2c);
    if (c.a11a8.g(r) > c.a1626.g(t) * c.k(1.01)) {
      c.v1176 = s(c.v1176 + 1);
      c.v0e20 = s(c.v0e20 + 1);
    }
  }
  for (let t = 0; t <= n + 1; t++) {
    c.a16de.p(t, a15ca.g(t));
    c.a170c.p(t, a15ca.g(t));
    c.a173a.p(t, c.a15f8.g(t));
    c.a1768.p(t, c.a1626.g(t));
    const ve = c.a1654.g(t, 0);
    const vd = c.a1654.g(t, 1);
    for (const [j, v] of [ve, vd, ve, ve, vd].entries()) c.a1796.p(t, j, v);
    if (t < n + 1 && t > 0) {
      c.a17c4.p(t, 0, ve);
      c.a17c4.p(t, 1, a15ca.g(t - 1));
    }
    if (t < n + 1) {
      bp4a.p(t, vd + c.a1654.g(t + 1, 0));
      bp60.p(t, 0, bp4a.g(t));
      bp60.p(t, 1, bp4a.g(t));
    }
  }

  if (c.v0e70 !== "N") {
    const a1682 = new M1(s, 14);
    const a16b0 = new M2(s, 14, 2);
    const limite = s(c.v0de4 - qb(c.v0e74 === "S") * 2 + n);
    for (let caso = s(1 - c.v0de0); caso <= limite; caso = s(caso + 1)) {
      for (let i = 0; i <= 14; i++) {
        a1682.p(i, 0);
        for (let j = 0; j <= 2; j++) a16b0.p(i, j, 0);
      }
      bp96 = new M1(s, 13);
      bpa8 = new M1(s, 13);
      if (!(n + c.v0de4 < caso)) {
        for (let t = 1; t <= n; t++) {
          if (t !== caso || c.a0faa.g(t) === 0) continue;
          termosDoTramo(
            c,
            t,
            c.a1090,
            c.a111a,
            (t, v) => a16b0.p(t, 0, v),
            (t, v) => a16b0.p(t, 1, v),
            (t) => a16b0.g(t, 0),
            (t) => a16b0.g(t, 1),
            bp96,
            bpa8,
          );
        }
      }
      if (n + c.v0de4 < caso) {
        if (n + c.v0de4 + 1 === caso) a1682.p(0, c.a1148.g(0));
        else a1682.p(n, c.a1148.g(1));
      }
      if (c.v0de0 !== 0 && !(caso !== 0 || c.a0faa.g(0) === 0)) {
        balanco(
          c,
          divisoesBalE(),
          c.a1090,
          c.a111a,
          () => a1682.g(0),
          (v) => a1682.p(0, v),
          () => a16b0.g(0, 1),
          (v) => a16b0.p(0, 1, v),
        );
      }
      if (c.v0de4 !== 0 && !(n + 1 !== caso || c.a0faa.g(n + 1) === 0)) {
        balanco(
          c,
          divisoesBalD(),
          c.a1090,
          c.a111a,
          () => a1682.g(n),
          (v) => a1682.p(n, v),
          () => a16b0.g(n + 1, 0),
          (v) => a16b0.p(n + 1, 0, v),
        );
      }
      bp72.p(1, n + c.v0de4 + 1 === caso || c.v0de8 === 0 ? 0 : 0.5);
      bp84.p(n, n + c.v0de4 + 2 === caso || c.v0dec === 0 ? 0 : 0.5);
      focos(c, bp72, bp84);
      if (!(c.v0dec === 0 && n === 1)) {
        const fim = qbCint(n - 1 - qb(n + c.v0de4 + 2 !== caso) * c.v0dec);
        for (let t = 1; t <= fim; t++) {
          a1682.p(
            t,
            ((bp72.g(t) * bp96.g(t) - bpa8.g(t)) * bp84.g(t)) / (1 - bp84.g(t) * bp72.g(t)),
          );
          a1682.p(t, a1682.g(t) - bp84.g(t) * a1682.g(t - 1));
        }
      }
      c.v0e2c = a1682.g(n);
      if (n + c.v0de4 + 2 !== caso && c.v0de4 === 0) c.v0e2c = 0;
      if (!(c.v0de8 === 0 && n === 1)) {
        const fim = qbCint(qb(n + c.v0de4 + 1 !== caso) * c.v0de8 + 2);
        for (let t = n; t >= fim; t--) {
          c.v0e30 = s(
            ((bp84.g(t) * bpa8.g(t) - bp96.g(t)) * bp72.g(t)) / (1 - bp84.g(t) * bp72.g(t)),
          );
          a1682.p(t - 1, c.v0e30 - bp72.g(t) * c.v0e2c + a1682.g(t - 1));
          c.v0e2c = s(c.v0e30 - bp72.g(t) * c.v0e2c);
        }
      }
      if (n + c.v0de4 >= caso && 1 - c.v0de8 <= n - 1 + c.v0dec) {
        for (let t = qbCint(1 - c.v0de8); t <= qbCint(n - 1 + c.v0dec); t++)
          a1682.p(t, a1682.g(t) * c.v0df4);
      }
      for (let t = 1; t <= n; t++) {
        const l = c.a1006.g(t);
        a16b0.p(t, 0, (a1682.g(t) - a1682.g(t - 1)) / l + a16b0.g(t, 0));
        a16b0.p(t, 1, (a1682.g(t - 1) - a1682.g(t)) / l + a16b0.g(t, 1));
      }
      for (let t = 0; t <= n + 1; t++) {
        const v0 = a16b0.g(t, 0);
        const v1 = a16b0.g(t, 1);
        if (!(n + c.v0de4 < caso)) {
          if (a1682.g(t) > 0) c.a16de.p(t, c.a16de.g(t) - a1682.g(t));
          if (t + 1 === caso) c.a170c.p(t, c.a170c.g(t) - a1682.g(t));
          if (v0 < 0) c.a1796.p(t, 0, c.a1796.g(t, 0) - v0);
          if (v1 < 0) c.a1796.p(t, 1, c.a1796.g(t, 1) - v1);
          if (t === caso) c.a1796.p(t, 2, c.a1796.g(t, 2) - v0);
          if (v0 > 0) c.a1796.p(t, 3, c.a1796.g(t, 3) - v0);
          if (v1 > 0) c.a1796.p(t, 4, c.a1796.g(t, 4) - v1);
          if (t < n + 1) {
            const r = v1 + a16b0.g(t + 1, 0);
            if (r < 0) bp60.p(t, 0, bp60.g(t, 0) - r);
            else bp60.p(t, 1, bp60.g(t, 1) - r);
          }
          if ((t + caso) / 2 === qbInt((t + caso) / 2)) continue;
          if (t > 0) c.a17c4.p(t, 0, c.a17c4.g(t, 0) - v0);
          if (t > 0) c.a17c4.p(t, 1, c.a17c4.g(t, 1) - a1682.g(t - 1));
          continue;
        }
        if (a1682.g(t) < 0) c.a16de.p(t, c.a16de.g(t) + a1682.g(t));
        if (a1682.g(t) < 0) c.a170c.p(t, c.a170c.g(t) + a1682.g(t));
        if (v0 > 0) c.a1796.p(t, 0, c.a1796.g(t, 0) + v0);
        if (v1 > 0) c.a1796.p(t, 1, c.a1796.g(t, 1) + v1);
        if (v0 > 0) c.a1796.p(t, 2, c.a1796.g(t, 2) + v0);
        if (v0 < 0) c.a1796.p(t, 3, c.a1796.g(t, 3) + v0);
        if (v1 < 0) c.a1796.p(t, 4, c.a1796.g(t, 4) + v1);
        if (t < n + 1) {
          const r = v1 + a16b0.g(t + 1, 0);
          if (r > 0) bp60.p(t, 0, r + bp60.g(t, 0));
          else bp60.p(t, 1, r + bp60.g(t, 1));
        }
        const par = (x: number) => x / 2 === qbInt(x / 2);
        const esquerdo =
          qb(n + c.v0de4 + 1 === caso) &
          ((qb(par(t + 1)) & qb(a1682.g(0) > 0)) | (qb(par(t)) & qb(a1682.g(0) < 0)));
        const direito =
          qb(n + c.v0de4 + 2 === caso) &
          ((qb(par(n - t)) & qb(a1682.g(n) > 0)) | (qb(par(n - t + 1)) & qb(a1682.g(n) < 0)));
        if (esquerdo === 0 && direito === 0) continue;
        if (t > 0) c.a17c4.p(t, 0, c.a17c4.g(t, 0) + v0);
        if (t > 0) c.a17c4.p(t, 1, c.a17c4.g(t, 1) + a1682.g(t - 1));
      }
    }
  }
  // M+ da envoltória (DESDIM.BAS:6283-6289)
  for (let t = 1; t <= n; t++) {
    c.v0e2c = c.a17c4.g(t, 1);
    c.v0e38 = c.a17c4.g(t, 0);
    momentoPositivo(c, t);
    c.a173a.p(t, c.v0e30);
    c.a1768.p(t, c.v0e2c);
  }
  alivio(c);
  c.impressaoDescalc = { reacao: bp4a, reacaoEnvoltoria: bp60, mep: bp38 };
  return c.impressaoDescalc;
}

/** Alívio do cortante: carga distribuída até h/2 do apoio e concentrada a menos de 2h
 *  reduzida de a/2h (L_5602E, DESDIM.BAS:6511-6582; U05-007). Usa a seção A_1232 como
 *  está no .SEC (o DESDIM ainda não completou a do balanço). */
function alivio(c: Comum) {
  const fimT = c.v0ddc + c.v0de4;
  for (let t = 1 - c.v0de0; t <= fimT; t++) {
    let l22 = 0;
    c.a1540.p(t, 0, Math.abs(c.a1796.g(t, 0)));
    if (Math.abs(c.a1796.g(t, 3)) > c.a1540.g(t, 0)) c.a1540.p(t, 0, Math.abs(c.a1796.g(t, 3)));
    c.a1540.p(t, 1, Math.abs(c.a1796.g(t, 1)));
    if (Math.abs(c.a1796.g(t, 4)) > c.a1540.g(t, 1)) c.a1540.p(t, 1, Math.abs(c.a1796.g(t, 4)));
    if (c.v182e === "N") continue;
    const h = c.a1232.g(t, 1);
    const l = c.a1006.g(t);
    if (t !== 0) {
      const fim = c.a0fd8.g(t);
      for (let i = 1 + (c.a0fd8.g(t) - c.a0faa.g(t)); i <= fim; i++) {
        const d = c.a10be.g(i);
        const p = c.a1062.g(i);
        const f = c.a10ec.g(i);
        if (d <= h / 200) c.a1540.p(t, 0, c.a1540.g(t, 0) - (d - l22) * p);
        if (h / 200 > l22 && d > h / 200) c.a1540.p(t, 0, c.a1540.g(t, 0) - (h / 200 - l22) * p);
        if (d < h / 50) {
          c.a1540.p(
            t,
            0,
            ((qb(c.v0ddc + 1 > t) * d + l) * f * ((d / h) * 50 - 1)) / l + c.a1540.g(t, 0),
          );
        }
        if (!(t > c.v0ddc)) {
          if (l - l22 <= h / 200) c.a1540.p(t, 1, c.a1540.g(t, 1) - (d - l22) * p);
          if (l - d < h / 200 && l - l22 > h / 200)
            c.a1540.p(t, 1, c.a1540.g(t, 1) - (h / 200 - (l - d)) * p);
          if (l - d < h / 50)
            c.a1540.p(t, 1, (f * d * (((l - d) / h) * 50 - 1)) / l + c.a1540.g(t, 1));
        }
        l22 = d;
      }
      continue;
    }
    for (let i = c.a0fd8.g(t); i >= 1 + (c.a0fd8.g(t) - c.a0faa.g(t)); i--) {
      const d = c.a10be.g(i);
      const p = c.a1062.g(i);
      const h0 = c.a1232.g(0, 1);
      if (d <= h0 / 200) c.a1540.p(0, 1, c.a1540.g(0, 1) - (d - l22) * p);
      if (h0 / 200 > l22 && d > h0 / 200) c.a1540.p(0, 1, c.a1540.g(0, 1) - (h0 / 200 - l22) * p);
      if (d < h0 / 50) c.a1540.p(0, 1, ((d / h0) * 50 - 1) * c.a10ec.g(i) + c.a1540.g(0, 1));
      l22 = d;
    }
  }
}
