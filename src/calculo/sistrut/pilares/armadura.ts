// Dimensionamento da armadura do pilar no PILAREDI: estimativa de As, arranjo das
// barras, verificação dos casos "e" (extremidades) e "f" (flambagem) e reescala
// da armadura até passar sem sobra; estribo pela tabela da bitola.
//
// Fonte: PILAREDI.BAS:6599-6944 (L_5675c, PISECEDI), 4666-4955 (S_45f89),
// 1999-2136 (S_24f4a), 5711-6310 (L_50cef: As, taxa, estribo). Livro:
// livros_viga_pilar.md 2.13 itens 4-9 (U53-051..062, U54-008..026). PLANO P8-P10, P14, P15.
import type { Etapa } from "../../tipos";
import { ErroNaoConverge, qbClng, qbInt } from "../base/f32";
import { PARAMETROS_PILAR } from "../base/parametros";
import type {
  BarraPilar,
  CasoPilar,
  DimensionaPilar,
  DimensionamentoPilar,
  ModoSistrut,
  ParametrosPilar,
  ParametrosPip,
  Ponto,
  RecusaPilar,
  SecaoPilar,
} from "../base/tipos";
import { type ControleDimensionamento, naoConverge, eluPilaredi } from "./elu";
import { casosExcentricidade, esbeltez, momentoDirecao, momentoTotal } from "./esforcos";
import {
  type BarraCalculo,
  type Contexto,
  type SecaoCalculo,
  criaContexto,
  inercias,
  integraConcreto,
  leiAco,
  novoEstado,
  posiciona,
  verticesRetangulo,
} from "./secao";

/** Geometria do original para o arranjo: polígono horário com o fecho, ou círculo. */
type Geometria =
  | { tipo: 1 | 3; vertices: Ponto[]; b: number; h: number }
  | { tipo: 2; d: number; dInterno: number };

function geometria(secao: SecaoPilar, s: (x: number) => number, modo: ModoSistrut): Geometria {
  if (secao.tipo === "circular") return { tipo: 2, d: s(secao.d), dInterno: s(secao.dInterno) };
  if (secao.tipo === "retangular") {
    const b = s(Math.abs(secao.b));
    const h = s(Math.abs(secao.h));
    // rotação da seção: os vértices giram antes do arranjo (PILAREDI.BAS:2579-2580)
    return { tipo: 1, b, h, vertices: verticesRetangulo(b, h, secao.rotacao ?? 0, modo) };
  }
  const v = secao.vertices.map((p) => ({ x: s(p.x), y: s(p.y) }));
  const fechado = [...v, v[0]!];
  let area = 0;
  for (let i = 0; i < v.length; i++)
    area += ((fechado[i]!.x + fechado[i + 1]!.x) * (fechado[i]!.y - fechado[i + 1]!.y)) / 2;
  // D-6: anti-horária dá área negativa no original; o corrigido inverte o sentido
  return {
    tipo: 3,
    b: 0,
    h: 0,
    vertices: modo === "corrigido" && area < 0 ? fechado.reverse() : fechado,
  };
}

/** Ponto a `offset` cm dos dois lados de um vértice, na bissetriz (PILAREDI.BAS:1999-2136,
 *  S_24f4a): ângulo de cada lado por quadrante e ponto = vértice + offset·(cos, sin)(b)/sin(b − a1). */
export function posicaoNoVertice(ctx: Contexto, ant: Ponto, v: Ponto, prox: Ponto, offset: number) {
  const { s, k } = ctx;
  const pi = k.pi;
  const meio = s(pi / 2);
  const [x0, y0, x, y, x1, y1] = [ant.x, ant.y, v.x, v.y, prox.x, prox.y];
  let a1 = 0;
  let a2 = 0;
  const maior = (a: number, b: number) => (a > b ? a : b);
  if (y0 >= y && x0 > x) {
    a1 = s(Math.atan((y0 - y) / (x0 - x)));
    if (y1 >= y && x1 > x) {
      a2 =
        (y1 - y) / (x1 - x) > (y0 - y) / (x0 - x)
          ? s(Math.atan((y1 - y) / (x1 - x)))
          : s(2 * pi + Math.atan((y1 - y) / (x1 - x)));
    }
    if (y1 > y && x1 <= x) a2 = x === x1 ? meio : s(pi - Math.atan((y1 - y) / (x - x1)));
    if (y1 <= y && x1 < x) a2 = s(Math.atan((y - y1) / (x - x1)) + pi);
    if (y1 < y && x1 >= x) a2 = x1 === x ? s(1.5 * pi) : s(2 * pi - Math.atan((y - y1) / (x1 - x)));
  }
  if (y0 > y && x0 <= x) {
    a1 = s(Math.atan((x - x0) / (y0 - y)) + meio);
    if (y1 > y && x1 <= x) {
      const d1 = maior(k.c00001, s(x - x1));
      const d0 = maior(k.c00001, s(x - x0));
      a2 =
        (y1 - y) / d1 < (y0 - y) / d0
          ? s(pi - Math.atan((y1 - y) / (x - x1)))
          : s(2.5 * pi + Math.atan((x - x1) / (y1 - y)));
    }
    if (y1 <= y && x1 < x) a2 = s(Math.atan((y - y1) / (x - x1)) + pi);
    if (y1 < y && x1 >= x) a2 = x1 === x ? s(1.5 * pi) : s(2 * pi - Math.atan((y - y1) / (x1 - x)));
    if (y1 >= y && x1 > x) a2 = s(2 * pi + Math.atan((y1 - y) / (x1 - x)));
  }
  if (y0 <= y && x0 < x) {
    a1 = s(Math.atan((y - y0) / (x - x0)) + pi);
    if (y1 < y && x1 < x) {
      a2 =
        (y - y1) / (x - x1) > (y - y0) / (x - x0)
          ? s(Math.atan((y - y1) / (x - x1)) + pi)
          : s(3 * pi + Math.atan((y - y1) / (x - x1)));
    }
    if (y1 < y && x1 >= x) a2 = s(1.5 * pi + Math.atan((x1 - x) / (y - y1)));
    if (y1 >= y && x1 > x) a2 = s(2 * pi + Math.atan((y1 - y) / (x1 - x)));
    if (y1 > y && x1 <= x) a2 = s(2.5 * pi + Math.atan((x - x1) / (y1 - y)));
  }
  if (y0 < y && x0 >= x) {
    a1 = s(1.5 * pi + Math.atan((x0 - x) / (y - y0)));
    if (y1 < y && x1 >= x) {
      const d1 = maior(k.c00001, s(x1 - x));
      const d0 = maior(k.c00001, s(x0 - x));
      a2 =
        (y - y1) / d1 < (y - y0) / d0
          ? s(2 * pi - Math.atan((y - y1) / (x1 - x)))
          : s(3.5 * pi + Math.atan((x1 - x) / (y - y1)));
    }
    if (y1 >= y && x1 > x) a2 = s(2 * pi + Math.atan((y1 - y) / (x1 - x)));
    if (y1 > y && x1 <= x) a2 = s(2.5 * pi + Math.atan((x - x1) / (y1 - y)));
    if (y1 <= y && x1 < x) a2 = s(3 * pi + Math.atan((y - y1) / (x - x1)));
  }
  const b = s((a1 + a2) / 2);
  return {
    x: s((Math.cos(b) / Math.sin(b - a1)) * offset + x),
    y: s((Math.sin(b) / Math.sin(b - a1)) * offset + y),
  };
}

/** Bitolas da tabela do .PIP (índice 0..12). */
type Tabela = ParametrosPip["bitolas"];

/** Próxima bitola com área (o original pula as de área 0); null depois de φ40. */
function proximaBitola(tab: Tabela, i: number) {
  for (let j = i + 1; j <= 12; j++) if (tab[j]!.area !== 0) return j;
  return null;
}

/** Arranjo de uma tentativa: barras nos vértices e complementares, ou o que fazer. */
export type Arranjo =
  | { tipo: "ok"; barras: BarraCalculo[]; indices: number[]; n1: number; n2: number }
  | { tipo: "misto" }
  | { tipo: "bitola" };

/** Arranjo poligonal (PILAREDI.BAS:6686-6880): uma barra de i1 em cada vértice, a
 *  `cobrimento + φ/2` dos lados; complementares de i2 em número par na retangular,
 *  distribuídas nos lados com espaço ≥ 2·smin, com espaçamento-alvo reduzido de
 *  0,005 até caberem. "misto": tentar i2 = i1; "bitola": subir a bitola. */
function arranjoPoligonal(
  ctx: Contexto,
  g: Extract<Geometria, { tipo: 1 | 3 }>,
  as: number,
  i1: number,
  i2: number,
  tab: Tabela,
  cobrimento: number,
  maximoBarras: number,
): Arranjo {
  const { s, pot, raizS } = ctx;
  const v = g.vertices;
  const n = v.length - 1;
  const a1 = tab[i1]!.area;
  const a2 = tab[i2]!.area;
  let n2 = 0;
  if (a1 * n < as) {
    n2 = qbInt(s((as - a1 * n) / a2));
    if (a1 * n + a2 * n2 < as) n2 += 1;
    if (g.tipo === 1 && n2 / 2 !== Math.trunc(qbClng(n2) / 2)) n2 += 1;
  }
  if (n + n2 > maximoBarras) return i2 < i1 ? { tipo: "misto" } : { tipo: "bitola" };
  const offset = s(tab[i1]!.bitola / 20 + cobrimento);
  const barras: BarraCalculo[] = [];
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = posicaoNoVertice(ctx, v[i === 0 ? n - 1 : i - 1]!, v[i]!, v[i + 1]!, offset);
    barras.push({ ...p, area: a1 });
    indices.push(i1);
  }
  if (n2 > 0) {
    const smin = tab[i2]!.espacamentoMinimo;
    const lado = (i: number) => {
      const q = barras[i === n - 1 ? 0 : i + 1]!;
      return { q, l: raizS(pot(q.y - barras[i]!.y, 2) + pot(q.x - barras[i]!.x, 2)) };
    };
    let total = 0;
    let lados = 0;
    for (let i = 0; i < n; i++) {
      const { l } = lado(i);
      if (smin * 2 <= l) {
        total = s(total + l);
        lados = s(lados + 1);
      }
    }
    if (total / (n2 + lados) < smin || total === 0)
      return i2 < i1 ? { tipo: "misto" } : { tipo: "bitola" };
    let alvo = s(total / (n2 + lados));
    for (let volta = 0; ; volta++) {
      if (volta > 100_000) throw naoConverge();
      const comp: BarraCalculo[] = [];
      let postas = 0;
      for (let i = 0; i < n; i++) {
        const { q, l } = lado(i);
        if (!(smin * 2 <= l)) continue;
        const f = s(l / alvo - 1);
        const r = s(n2 - postas);
        let m = qbInt(f < r ? f : r);
        if (i === 1 && g.tipo === 1) m = Math.trunc(qbClng(n2 - 2 * postas) / 2);
        if (m < 0) m = 0;
        const p = barras[i]!;
        const dx = s(q.x - p.x);
        const dy = s(q.y - p.y);
        for (let j = 1; j <= m; j++)
          comp.push({ x: s((j / (m + 1)) * dx + p.x), y: s((j / (m + 1)) * dy + p.y), area: a2 });
        postas = s(postas + m);
      }
      if (postas < n2) {
        alvo = s(alvo - ctx.k.c0005);
        continue;
      }
      barras.push(...comp);
      for (let j = 0; j < comp.length; j++) indices.push(i2);
      break;
    }
  }
  return { tipo: "ok", barras, indices, n1: n, n2 };
}

/** Arranjo circular (PILAREDI.BAS:6815-6935): n1 = INT(As·(0,7 com vazado)/a) + 1 no
 *  anel externo a D/2 − c − φ/2 (posições CINT a 0,1 cm), anel interno com
 *  INT(0,3·As/a) + 1 se houver vazado; espaçamento (D − 2c)·π/n1 ≥ smin. Numa
 *  variação de armadura que não é a primeira (V_0fec > 0), mais barras que a
 *  anterior (A_141e 1 + 3) passa direto à bitola seguinte, sem o "misto"
 *  (6848-6859). */
export function arranjoCircular(
  ctx: Contexto,
  g: Extract<Geometria, { tipo: 2 }>,
  as: number,
  i1: number,
  i2: number,
  tab: Tabela,
  cobrimento: number,
  barrasAnteriores?: number,
  maximoBarras: number = PARAMETROS_PILAR.maximoBarras,
): Arranjo {
  const { s, k } = ctx;
  const a1 = tab[i1]!.area;
  const n1 = s(qbInt((((g.dInterno > 0 ? -k.c03 : 0) + 1) / a1) * as) + 1);
  const n2 = g.dInterno > 0 ? s(qbInt((as / tab[i2]!.area) * k.c03) + 1) : 0;
  if (n1 + n2 > maximoBarras) return i2 < i1 ? { tipo: "misto" } : { tipo: "bitola" };
  if (barrasAnteriores !== undefined && n1 + n2 > barrasAnteriores) return { tipo: "bitola" };
  const barras: BarraCalculo[] = [];
  const indices: number[] = [];
  const r1 = g.d / 2 - cobrimento - tab[i1]!.bitola / 20;
  for (let i = 1; i <= n1; i++) {
    const ang = ((i * 2 - 2) * k.pi) / n1;
    barras.push({
      x: s(g.d / 2 + qbCintLocal(Math.cos(ang) * r1 * 10) / 10),
      y: s(g.d / 2 + qbCintLocal(Math.sin(ang) * r1 * 10) / 10),
      area: a1,
    });
    indices.push(i1);
  }
  const r2 = g.dInterno / 2 + cobrimento + tab[i2]!.bitola / 20;
  for (let i = n1 + 1; i <= n1 + n2; i++) {
    const ang = ((i * 2 - 2) * k.pi) / n2;
    barras.push({
      x: s(g.d / 2 + qbCintLocal(Math.cos(ang) * r2 * 10) / 10),
      y: s(g.d / 2 + qbCintLocal(Math.sin(ang) * r2 * 10) / 10),
      area: tab[i2]!.area,
    });
    indices.push(i2);
  }
  if (((g.d - 2 * cobrimento) * k.pi) / n1 < tab[i1]!.espacamentoMinimo)
    return i2 < i1 ? { tipo: "misto" } : { tipo: "bitola" };
  return { tipo: "ok", barras, indices, n1, n2 };
}

const qbCintLocal = (x: number) => {
  const piso = Math.floor(x);
  const resto = x - piso;
  if (resto > 0.5) return piso + 1;
  if (resto < 0.5) return piso;
  return piso % 2 === 0 ? piso : piso + 1;
};

/** As do arranjo como o original soma: a1·n1 + a2·n2 na pilha (PILAREDI.BAS:6890-6900). */
function areaArranjo(a: Extract<Arranjo, { tipo: "ok" }>, tab: Tabela) {
  const i1 = a.indices[0]!;
  const i2 = a.indices[a.indices.length - 1]!;
  return tab[i1]!.area * a.n1 + tab[i2]!.area * a.n2;
}

/** Dados de um nível para o S_45f89. */
interface DadosNivel {
  nk: number;
  mkx: number;
  mky: number;
  lex: number;
  ley: number;
}

/** S_45f89 (PILAREDI.BAS:4666-4955): λ com le = 0 no modo "e" e com o le do nível no
 *  modo "f"; λ > 140 recusa (P15); no "f" com λ ≤ 40 nas duas direções não verifica;
 *  casos de excentricidade e ELU de cada um, parando no primeiro "NAO". */
function verificaArranjo(
  ctx: Contexto,
  sec: SecaoCalculo,
  flambagem: boolean,
  dados: DadosNivel,
  par: ParametrosPilar,
  ctl: ControleDimensionamento,
) {
  const { s, raiz } = ctx;
  const est = novoEstado(sec);
  const { jx, jy, area } = inercias(ctx, est);
  const lex = flambagem ? dados.lex : 0;
  const ley = flambagem ? dados.ley : 0;
  const lambdaX = esbeltez(ctx.modo, lex, jy, area);
  const lambdaY = esbeltez(ctx.modo, ley, jx, area);
  const ec = s(raiz(par.coeficienteTensao * ctx.mat.fck * 1000 + 35) * par.multiplicadorEc * 21);
  const casos: CasoPilar[] = [];
  const saida = {
    lambdaX,
    lambdaY,
    area,
    casos,
    recusa: undefined as RecusaPilar | undefined,
    pulou: false,
  };
  if (lambdaY > par.lambdaProcessoExato || lambdaX > par.lambdaProcessoExato)
    return { ...saida, recusa: "LAMBDA" as const };
  if (flambagem && lambdaY <= par.lambda2aOrdem && lambdaX <= par.lambda2aOrdem)
    return { ...saida, pulou: true };
  const simetrica = (sec.tipo === 1 || sec.tipo === 2) && par.secoesSimetricas;
  const sinais = casosExcentricidade(dados.mkx, dados.mky, simetrica, par.excentricidades);
  const parAtuante = { ...par, ec };
  ctl.sinal = "";
  for (let i = 0; i < sinais.length; i++) {
    const sinal = sinais[i]!;
    const x = momentoDirecao(
      ctx,
      est,
      dados.mkx >= 0 ? 270 : 90,
      dados.nk,
      { mk: dados.mkx, sinal: sinal.x, lambda: lambdaX, le: lex, j: jy },
      parAtuante,
    );
    const y = momentoDirecao(
      ctx,
      est,
      dados.mky < 0 ? 180 : 0,
      dados.nk,
      { mk: dados.mky, sinal: sinal.y, lambda: lambdaY, le: ley, j: jx },
      parAtuante,
    );
    const { mtot, angulo } = momentoTotal(ctx, x.total, y.total);
    ctx.integracoes = 0;
    const r = eluPilaredi(
      ctx,
      est,
      {
        nk: dados.nk,
        mx: x.total,
        my: y.total,
        mtot,
        angulo,
        lambdaX,
        lambdaY,
        lex,
        ley,
        lambda2a: par.lambda2aOrdem,
      },
      i + 1,
      sec.tipo === 2,
      ctl,
    );
    if (r === null) {
      if (ctl.fator < ctx.k.c11) ctl.fator = ctx.k.c11;
      if (i > 0) ctl.anguloInicial = -1;
      return saida;
    }
    casos.push({
      rotulo: `${i + 1}${flambagem ? "f" : "e"}`,
      mxa: x.ma + x.mc,
      mya: y.ma + y.mc,
      mx: x.total,
      my: y.total,
      mTotal: mtot,
      anguloAtuante: angulo,
      ...r,
    });
    ctl.anguloInicial = -1;
  }
  return saida;
}

/** O sinal que o ELU deixou no controle (lido por função: o TS não vê a mutação). */
const sinalDe = (c: ControleDimensionamento) => c.sinal;

/** Dimensionamento PILAREDI de um nível (PILAREDI.BAS:5711-6310 e 6599-6944).
 *  As0 = max[(Nk·γf − Nc/γf)·1,2/σs(2 ‰); Nk/(0,85·fck·100)·γf·γc·0,8 %; 0,5 %·A];
 *  barras a partir de φ10; caso "e" e depois "f" com a mesma armadura; "NAO" reescala
 *  As por min(fator, 1,6) e "DIMINUI" por max(fator, 0,7), no máximo 5 vezes;
 *  taxa = INT(As·10000/A)/100; estribo pela tabela, s ≤ menor lado.
 *  caso_c_pilaredi P5: As 3,20 (0,80 %), 4 # 10, # 6.3 c/12. */
export const dimensionaPilar: DimensionaPilar = (
  carga,
  coluna,
  materiais,
  par,
  pip,
  modo,
  opcoes = {},
) => {
  const ctx = criaContexto(modo, {
    fck: materiais.fck,
    fyk: materiais.fyk,
    aco: materiais.classeAco,
    csf: materiais.gamaF,
    csc: materiais.gamaC,
    csa: materiais.gamaS,
    coefTensao: par.coeficienteTensao,
  });
  const { s, k } = ctx;
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const nivel = coluna.niveis[carga.nivel];
  if (!nivel) throw new Error(`Nível ${carga.nivel} não existe na coluna ${coluna.nome}`);
  const g = geometria(nivel.secao, s, modo);
  const tab = pip.bitolas;
  const cobrimento = pip.cobrimento;
  const dados: DadosNivel = {
    nk: s(carga.nk * par.coeficienteForca),
    mkx: s(carga.mkx * par.coeficienteForca * par.coeficienteMedida),
    mky: s(carga.mky * par.coeficienteForca * par.coeficienteMedida),
    lex: carga.lex,
    ley: carga.ley,
  };
  // momentos do caso "f" (0,6·M1 + 0,4·M2)
  const mf = carga.momentosFlambagem;
  const dadosF: DadosNivel = {
    ...dados,
    mkx: s(mf.mkx * par.coeficienteForca * par.coeficienteMedida),
    mky: s(mf.mky * par.coeficienteForca * par.coeficienteMedida),
  };
  const resultado: DimensionamentoPilar = {
    coluna: coluna.nome,
    nivel: carga.nivel,
    lambdaX: 0,
    lambdaY: 0,
    casos: [],
    as: 0,
    taxa: 0,
    barras: [],
    estribo: { bitola: 0, espacamento: 0 },
    secao: nivel.secao,
    avisos,
    memoria,
  };
  if (modo === "original" && dados.nk === 0) {
    avisos.push(
      "Nk = 0: o original divide por zero na busca do equilíbrio (D-3); nível não dimensionado.",
    );
    return { ...resultado, recusa: "NKNULO" };
  }
  const secaoDe = (barras: BarraCalculo[]): SecaoCalculo =>
    g.tipo === 2
      ? { tipo: 2, diametro: g.d, diametroInterno: g.dInterno, barras }
      : { tipo: g.tipo, vertices: g.vertices, barras };

  // As0 (PILAREDI.BAS:6649-6663): concreto e aço com ξ = 12 (2 ‰ uniforme)
  const est0 = novoEstado(secaoDe([]));
  posiciona(ctx, est0, 270);
  est0.d = s(est0.altura - cobrimento);
  est0.kappa = 0;
  est0.xi = 12;
  integraConcreto(ctx, est0);
  const area = est0.area;
  const sigma2 = leiAco(ctx, est0, cobrimento).sigma;
  const asAco = s(((carga.nk * materiais.gamaF * par.coeficienteForca - est0.nc) * k.c12) / sigma2);
  const asConc = s(
    (carga.nk / (materiais.fck * par.coeficienteTensao * est0.rusch * 100)) *
      materiais.gamaF *
      par.coeficienteForca *
      materiais.gamaC *
      pip.taxaMinimaCalculada,
  );
  const asMin = s((area * pip.taxaMinimaReal) / 100);
  let as = asAco > asConc ? asAco : asConc;
  as = as > asMin ? as : asMin;
  memoria.push(
    {
      descricao: "As por compressão: (Nk·γf − Nc)·1,2/σs(2 ‰)",
      valor: asAco,
      unidade: "cm²",
      ref: "PILAREDI.BAS:6655",
    },
    {
      descricao: "As por taxa sobre a seção calculada",
      valor: asConc,
      unidade: "cm²",
      ref: "PILAREDI.BAS:6656",
    },
    { descricao: "As mínima 0,5 % de A", valor: asMin, unidade: "cm²", ref: "PILAREDI.BAS:6658" },
    { descricao: "As estimada", valor: as, unidade: "cm²", ref: "PILAREDI.BAS:6649-6663" },
  );
  const limite = s((area / ((pip.traspasseNaTaxa ? 2 : 1) * 100)) * pip.taxaMaxima);
  const ctl: ControleDimensionamento = { anguloInicial: -1, sinal: "", fator: 0 };
  let i1 = pip.ordemBitolaMinima;
  let marca = "";
  let flambagem = false;
  let asE = 0;
  let arranjo: Extract<Arranjo, { tipo: "ok" }> | null = null;
  let casosE: CasoPilar[] = [];
  let casosF: CasoPilar[] = [];
  let lambdas = { lambdaX: 0, lambdaY: 0 };
  const recusa = (r: RecusaPilar, texto: string) => {
    avisos.push(texto);
    return { ...resultado, casos: [...casosE, ...casosF], recusa: r };
  };
  /** Estribo pela tabela do .PIP, limitado a MIN(B, H) e a D − Dint (PILAREDI.BAS:5876-5885). */
  const estriboDa = (indice: number, dado?: { bitola: number; espacamento: number }) => {
    const estribo = { ...(dado ?? pip.estriboPorBitola[indice]!) };
    if (g.tipo === 1) {
      const b = Math.round(g.b);
      const h = Math.round(g.h);
      if (b < h) {
        if (b < estribo.espacamento) estribo.espacamento = b;
      } else if (h < estribo.espacamento) estribo.espacamento = h;
    }
    if (g.tipo === 2 && g.d - g.dInterno < estribo.espacamento)
      estribo.espacamento = g.d - g.dInterno;
    return estribo;
  };
  if (opcoes.barrasDadas) {
    // armadura dada: casos "e" e "f" com as barras, sem os ajustes (REDEFINE)
    const dadas = opcoes.barrasDadas;
    const indices = dadas.map((b) => tab.findIndex((t) => s(t.bitola) === s(b.bitola)));
    const fora = dadas.find((_, i) => indices[i]! < 0);
    if (fora) throw new Error(`Bitola ${fora.bitola} mm fora da tabela do .PIP`);
    const calc: BarraCalculo[] = dadas.map((b, i) => ({
      x: s(b.x),
      y: s(b.y),
      area: tab[indices[i]!]!.area,
    }));
    try {
      // REDEFINE com "NAO": o original volta à edição da armadura (PILAREDI.BAS:5800-5808)
      const naoResiste = (caso: string) =>
        recusa(
          "NAO",
          `A armadura dada não resiste no caso "${caso}": o PILAREDI volta à redefinição da armadura (REDEFINE, PILAREDI.BAS:5800-5808).`,
        );
      const e = verificaArranjo(ctx, secaoDe(calc), false, dados, par, ctl);
      casosE = e.casos;
      if (e.recusa === "LAMBDA")
        return recusa("LAMBDA", `λ > ${par.lambdaProcessoExato}: o PILAREDI recusa o nível (P15).`);
      if (sinalDe(ctl) === "NAO") return naoResiste("e");
      ctl.anguloInicial = -1;
      const f = verificaArranjo(ctx, secaoDe(calc), true, dadosF, par, ctl);
      casosF = f.casos;
      lambdas = { lambdaX: f.lambdaX, lambdaY: f.lambdaY };
      if (f.recusa === "LAMBDA")
        return recusa("LAMBDA", `λ > ${par.lambdaProcessoExato}: o PILAREDI recusa o nível (P15).`);
      // verificaArranjo regrava ctl.sinal: lido de novo depois da 2ª chamada
      if (sinalDe(ctl) === "NAO") return naoResiste("f");
    } catch (erro) {
      if (erro instanceof ErroNaoConverge)
        return recusa(
          "NAOCONVERGE",
          "A busca do equilíbrio não converge; o original fica em laço (D-2).",
        );
      throw erro;
    }
    let asDada = 0;
    for (const b of calc) asDada = s(asDada + b.area);
    // grupos na ordem em que aparecem: o 1º é o da bitola V_1086 (A_141e 1..2)
    const grupos = new Map<number, number>();
    indices.forEach((i) => grupos.set(i, (grupos.get(i) ?? 0) + 1));
    const ordem = [...grupos.keys()];
    memoria.push({
      descricao: "Armadura dada: verificada sem escolha nem ajuste",
      valor: asDada,
      unidade: "cm²",
      ref: "PILAREDI.BAS:6897-6898",
    });
    return {
      ...resultado,
      lambdaX: lambdas.lambdaX,
      lambdaY: lambdas.lambdaY,
      casos: [...casosE, ...casosF],
      as: asDada,
      taxa: s(qbInt((asDada * 10000) / area) / 100),
      barras: ordem.map((i) => ({ quantidade: grupos.get(i)!, bitola: tab[i]!.bitola })),
      // estribo pela bitola V_1086 do 1º grupo, ou o dado, com o espaçamento limitado ao
      // menor lado e a D − Dint (PILAREDI.BAS:5862-5890)
      estribo: estriboDa(ordem[0] ?? 0, opcoes.estribo),
      secao: { ...nivel.secao, barras: dadas.map((b) => ({ ...b })) },
      armaduraDada: true,
    };
  }
  try {
    for (let volta = 0; ; volta++) {
      if (volta > 1000) throw naoConverge();
      if (arranjo === null) {
        // L_56db1
        if (marca === "ESGOTADO" && limite < as)
          return recusa(
            "NAOSUPORTA",
            "A seção não suporta os esforços com a taxa máxima de armadura configurada.",
          );
        let i2 = i1;
        if (pip.misturaBitolas && i1 > pip.ordemBitolaMinima) i2 = i1 - 1;
        if (g.tipo === 2 || tab[i2]!.area === 0) i2 = i1;
        let r: Arranjo;
        for (;;) {
          r =
            g.tipo === 2
              ? arranjoCircular(
                  ctx,
                  g,
                  as,
                  i1,
                  i2,
                  tab,
                  cobrimento,
                  opcoes.barrasAnteriores,
                  par.maximoBarras,
                )
              : arranjoPoligonal(ctx, g, as, i1, i2, tab, cobrimento, par.maximoBarras);
          if (r.tipo === "misto") {
            i2 = i1;
            continue;
          }
          break;
        }
        if (r.tipo === "bitola") {
          const prox = proximaBitola(tab, i1);
          if (prox === null)
            return recusa(
              "NAOBARRA",
              "Número máximo de barras ou perímetro insuficiente para a armadura necessária.",
            );
          i1 = prox;
          continue;
        }
        arranjo = r;
      }
      const atual = arranjo;
      const v = verificaArranjo(
        ctx,
        secaoDe(atual.barras),
        flambagem,
        flambagem ? dadosF : dados,
        par,
        ctl,
      );
      if (v.recusa === "LAMBDA")
        return recusa("LAMBDA", `λ > ${par.lambdaProcessoExato}: o PILAREDI recusa o nível (P15).`);
      if (flambagem) {
        casosF = v.casos;
        lambdas = { lambdaX: v.lambdaX, lambdaY: v.lambdaY };
      } else casosE = v.casos;
      const asEf = areaArranjo(atual, tab);
      if (ctl.sinal === "NAO") {
        const fator = ctl.fator < k.c16 ? ctl.fator : k.c16;
        as = s(asEf * fator);
        if (marca !== "ESGOTADO" && limite < as) {
          as = s(limite - k.c01);
          marca = "ESGOTADO";
        }
        if (marca.includes("JADIMINUIU") && ctl.fator < k.c16) marca = "JADIMINUIU****";
        arranjo = null;
        continue;
      }
      if (ctl.sinal === "DIMINUI") {
        const minimo = (area * pip.taxaMinimaReal) / 100;
        if (
          k.c103 * asE < as &&
          k.c103 * minimo < as &&
          !marca.includes("****") &&
          ctl.fator < k.c0976
        ) {
          as = s(asEf * (ctl.fator > k.c07 ? ctl.fator : k.c07));
          if (s(minimo) > as) {
            as = s(minimo);
            marca = "JADIMINUIU***";
          }
          if (as < asE) as = asE;
          marca = marca.startsWith("JADI") ? `${marca}*` : "JADIMINUIU";
          i1 = pip.ordemBitolaMinima;
          arranjo = null;
          continue;
        }
        ctl.sinal = "";
      }
      if (!flambagem) {
        asE = asEf;
        flambagem = true;
        marca = "";
        ctl.anguloInicial = -1;
        continue;
      }
      break;
    }
  } catch (e) {
    if (e instanceof ErroNaoConverge)
      return recusa(
        "NAOCONVERGE",
        "A busca do equilíbrio não converge; o original fica em laço (D-2).",
      );
    throw e;
  }
  const final = arranjo!;
  const asEf = s(areaArranjo(final, tab));
  const i2 = final.indices[final.indices.length - 1]!;
  const barras =
    i1 === i2
      ? [{ quantidade: final.n1 + final.n2, bitola: tab[i1]!.bitola }]
      : [
          { quantidade: final.n1, bitola: tab[i1]!.bitola },
          { quantidade: final.n2, bitola: tab[i2]!.bitola },
        ];
  const taxa = s(qbInt((asEf * 10000) / area) / 100);
  const estribo = estriboDa(i1);
  const barrasSecao: BarraPilar[] = final.barras.map((b, i) => ({
    x: b.x,
    y: b.y,
    bitola: tab[final.indices[i]!]!.bitola,
  }));
  memoria.push(
    { descricao: "As efetiva", valor: asEf, unidade: "cm²", ref: "PILAREDI.BAS:5913-5918" },
    { descricao: "Taxa INT(As·10000/A)/100", valor: taxa, unidade: "%", ref: "PILAREDI.BAS:5913" },
  );
  return {
    ...resultado,
    lambdaX: lambdas.lambdaX,
    lambdaY: lambdas.lambdaY,
    casos: [...casosE, ...casosF],
    as: asEf,
    taxa,
    barras,
    estribo,
    secao: { ...nivel.secao, barras: barrasSecao },
  };
};
