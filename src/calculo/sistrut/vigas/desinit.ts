// Detalhamento da viga como o SISTRUT 4.0 faz (DESAUXDI do DESDIM + DESINIT): corte das
// barras sobre o diagrama de 21 pontos, ancoragem por τbu, dobras, grampos, pele,
// porta-estribos, trechos de estribos e o comprimento de cada posição como o quadro de
// ferros do DESINIT o calcula (FUN_2000_2FE8, DESINIT.BAS:562-700).
// Especificação: livros_arm_forma_des.md 4.3; PLANO D7, D8 e R11.
//
// `detalhaViga` implementa o contrato `DetalhaViga`. O contrato não traz tudo o que o
// DESINIT lê do .FOR e do DESDIM; `detalhaVigaDesinit` aceita esses dados a mais
// (`ExtrasDesinit`) e `detalhaViga` usa os padrões da tela do DESENHO para eles.
import type {
  DetalhaViga,
  DetalhamentoViga,
  DimensionamentoViga,
  EntradaDesdim,
  FlexaoViga,
  ModoSistrut,
  PosicaoBarra,
  TramoDimensionado,
} from "../base/tipos";
import type { Etapa } from "../../tipos";
import { AREAS_DSP_CORRIGIDAS } from "../base/parametros";
import { ErroQB, qbCint, qbStr } from "../base/f32";
import { Comum, qb } from "./desinitComum";
import { apoiosComNegativo, cortaBarras } from "./desinitCorte";
import { detalhaLongitudinal, estribos, faces, portaEstribos, qbVal } from "./desinitBarras";

/** Um apoio como o .FOR o grava (A_1926(k,0), A_1954$, A_1982; DESDIM.BAS:4457-4621).
 *  Na tela do DESENHO: "Apoio Tipo Titulo LPi LPs Dis". */
export interface ApoioFormaViga {
  /** Largura do apoio na direção da viga (LPi), cm. */
  largura: number;
  /** P pilar, V viga, O outro, A apoio. */
  tipo: "P" | "V" | "O" | "A";
  titulo: string;
  /** Código do apoio (A_1982(k,0); 1 = "Continua Constante", o padrão). */
  codigo: number;
  /** LPs e Dis (A_1982(k,1..2)), cm. */
  lps: number;
  dis: number;
}

/** Eixo e alinhamento de um tramo (A_19DE, A_19B0), cm: distância da face do apoio ao
 *  eixo e desnível da face superior. Índice do original: 0 balanço esquerdo, 1..n
 *  tramos, n+1 balanço direito. */
export interface EixoTramoViga {
  eixo: number;
  alinhamento: number;
}

/** Dados que o DESINIT usa e o contrato `EntradaDesdim`/`DimensionamentoViga` não traz. */
export interface ExtrasDesinit {
  /** Apoios 0..n. Padrão: largura do apoio à esquerda de cada tramo (o último repete o
   *  anterior ou vem do balanço direito), tipo P, título P1.., código 1, LPs = largura. */
  apoios?: ApoioFormaViga[];
  /** Por índice do original (0..n+1). Padrão: eixo = metade da largura do apoio à
   *  esquerda (eixos centralizados), alinhamento 0 (face superior alinhada). */
  eixos?: EixoTramoViga[];
  /** Arranjo da armadura comprimida ("2#10") dos tramos 1..n (índice t − 1) e dos apoios
   *  0..n. Padrão: "-" sem As comprimida; com As', o arranjo que o DESDIM escolhe
   *  (L_1600A). */
  comprimidaTramos?: string[];
  comprimidaApoios?: string[];
}

/** Posição com as dobras (ganchos) das pontas, cm, que o contrato `PosicaoBarra` não traz
 *  (A_1B4E/A_1B20; o comprimento já as inclui). */
export interface PosicaoDesinit extends PosicaoBarra {
  dobras: [number, number];
}

/** Trecho de estribos de um tramo (A_1C06): início e fim (cm), bitola, espaçamento,
 *  estribos lado a lado e o nº da posição (`posicao`, 1 = primeira posição de estribo). */
export interface TrechoEstribo {
  inicio: number;
  fim: number;
  bitola: number;
  espacamento: number;
  ladoALado: number;
  posicao: number;
  /** INT((fim − início)/s) + 1 (DESINIT.BAS:892; U07-029). */
  quantidade: number;
}

/** Detalhamento com as dobras e os trechos de estribo. */
export interface DetalhamentoDesinit extends DetalhamentoViga {
  posicoes: PosicaoDesinit[];
  trechosEstribo: TrechoEstribo[];
}

/** Arranjo da armadura comprimida pela área (L_1600A, DESDIM.BAS:3276-3335): o menor
 *  φ entre 6,3 e 20 em que (n + 1 ou n + 2) barras passam da área, n = 2/4/6 pela
 *  largura; senão φ25 (ou 20, 16) com MAX(2, teto(As/a)). */
export function arranjoComprimido(c: Comum, as: number, bw: number) {
  const base = 2 - qb(bw > c.v0f3e) * 2 - qb(bw > c.v0f42) * 2;
  const teto = (x: number) => c.int(x) - qb(x !== c.int(x));
  const tetoMaior = (x: number) => c.int(x) - qb(x > c.int(x));
  const opcoes: [number, number][] = [
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 2],
    [6, 2],
    [7, 2],
  ];
  let bitola = 0;
  let n = 0;
  const escolhida = opcoes.find(([i, extra]) => (base + extra) * c.area.g(i) > as);
  if (escolhida) {
    bitola = c.bitola.g(escolhida[0]);
    n = teto(as / c.area.g(escolhida[0]));
  } else {
    const i = c.area.g(8) > 0 ? 8 : c.area.g(7) > 0 ? 7 : 6;
    bitola = c.bitola.g(i);
    n = Math.max(2, tetoMaior(as / c.area.g(i)));
  }
  return `${qbStr(n).slice(1)}#${qbStr(bitola).slice(1)}`;
}

/** Lê "n1#φ1+n2#φ2" para n1, φ1, n2, φ2 (L_1521A, DESDIM.BAS:3135-3148). */
export function leArranjo(texto: string): [number, number, number, number] {
  const n1 = qbVal(texto);
  const f1 = qbVal(texto.slice(texto.indexOf("#") + 1));
  const mais = texto.indexOf("+");
  if (mais < 0) return [n1, f1, 0, 0];
  const f2 = qbVal(texto.slice(texto.indexOf("#", mais) + 1));
  let n2 = qbVal(texto.slice(mais + 1));
  if (n2 === 0) n2 = 1;
  return [n1, f1, n2, f2];
}

/** Espaçamento mínimo de estribo do tramo (V_0ED6): INT(d/2) ou INT(h/2) limitado ao
 *  máximo; com o estribo mínimo de bitola V_0ED2; arredondado para baixo na lista do .DSP
 *  (L_16B55, DESDIM.BAS:3395-3460). */
function espacamentoMinimo(c: Comum, bw: number, h: number) {
  const d = h - c.v0ea6;
  let s0 = c.int(c.v18c6 === 0 ? d / 2 : h / 2);
  s0 = s0 <= c.v18c2 ? s0 : c.v18c2;
  const ramos = bw > c.v0f3e ? (bw > c.v0f42 ? 3 : 2) : 1;
  const m = Math.min(bw, d);
  for (let i = 4; i >= 0; i--) {
    if (c.v0ed2 !== c.bitola.g(i)) continue;
    const sMin = (ramos / (c.v189e * m)) * c.area.g(i) * 200;
    if (sMin <= s0) s0 = Math.max(c.int(sMin), c.v18be);
  }
  if (s0 === c.v18c2) return c.s(s0);
  // Busca na lista "10/ 12/ ... 30/" como o original (DESDIM.BAS:3451-3468): sem o
  // próximo espaço, INSTR dá 0 e MID$(lista, 0) é erro 5. O .DSP de fábrica e o embutido
  // (DESENHO.BAS:4951) não terminam com espaço: s fora de [10, 30) quebra o original.
  const lista = c.v1906;
  const instr = (de: number) => lista.indexOf(" ", de) + 1;
  let pos = 1;
  let atual = qbVal(lista);
  for (;;) {
    const k = instr(pos);
    if (k === 0) throw new ErroQB(5, "Illegal function call (MID$ da lista de espaçamentos)");
    if (s0 < qbVal(lista.slice(k - 1)) && s0 >= atual) return c.s(atual);
    pos = k;
    atual = qbVal(lista.slice(pos - 1));
  }
}

/** Monta o COMMON (`Comum`) com a viga, a análise, o dimensionamento, a forma e o .DSP,
 *  como o DESDIM o deixa para o DESAUXDI e o DESINIT. */
export function montaComum(
  entrada: EntradaDesdim,
  dim: DimensionamentoViga,
  modo: ModoSistrut,
  extras: ExtrasDesinit = {},
) {
  const c = new Comum(modo);
  const { viga, analise, secoes, forma, materiais, parametros: p } = entrada;
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

  // análise (DESCALC, DESDIM.BAS:6014-6035)
  for (let k = 0; k <= n; k++) {
    const m = analise.apoios[k]?.m ?? 0;
    c.a16de.p(k, m);
    c.a170c.p(k, m);
  }
  for (let t = 1; t <= n; t++) {
    const tr = analise.tramos[t - 1];
    c.a1654.p(t, 0, tr?.ve ?? 0);
    c.a1654.p(t, 1, tr?.vd ?? 0);
    c.a1768.p(t, tr?.mPositivo ?? 0);
    c.a1626.p(t, tr?.mPositivo ?? 0);
    c.a17c4.p(t, 0, tr?.ve ?? 0);
    c.a17c4.p(t, 1, c.a16de.g(t - 1));
  }
  // engastamento perfeito (A_11D6, A_11A8, A_1204(i,0); DESDIM.BAS:5965-6006): Ve =
  // Ve isostático + (M dir. − M esq.)/L, com os M de engastamento perfeito, mais o termo
  // dos momentos externos com acidentais "N"
  c.v1176 = Math.min(9, analise.engastamentoPerfeito.length);
  for (let i = 1; i <= c.v1176; i++) {
    const ep = analise.engastamentoPerfeito[i - 1]!;
    const t = ep.tramo;
    const vao = c.a1006.g(t);
    const tr = analise.tramos[t - 1];
    const veIso = (tr?.ve ?? 0) - (c.a16de.g(t) - c.a16de.g(t - 1)) / vao;
    let ve = veIso + (ep.mDireito - ep.mEsquerdo) / vao;
    if (c.v0e74 === "S" && c.v0e70 === "N") {
      const e = c.v0de8 === 0 && c.v0de0 === 0 && t === 1 ? 0 : 1;
      const d = c.v0dec === 0 && c.v0de4 === 0 && t === n ? 0 : 1;
      if (t === 1) ve = ((qb(d === 0) + (qb(d === 1) * 3) / 2) * c.a1148.g(0)) / vao + ve;
      if (t === n) ve = ve - ((qb(e === 0) + (qb(e === 1) * 3) / 2) * c.a1148.g(1)) / vao;
    }
    c.a11d6.p(i, t);
    c.a11a8.p(i, ep.mPositivo);
    c.a1204.p(i, 0, ve);
  }
  if (analise.balancoEsquerdo) c.a1654.p(0, 1, analise.balancoEsquerdo.carga);
  if (analise.balancoDireito) c.a1654.p(n + 1, 0, analise.balancoDireito.carga);
  for (let t = 0; t <= n + 1; t++) {
    const ve = c.a1654.g(t, 0);
    const vd = c.a1654.g(t, 1);
    for (const [j, v] of [ve, vd, ve, ve, vd].entries()) c.a1796.p(t, j, v);
  }

  // seções (.SEC) e o balanço sem seção, que herda a do apoio (DESDIM.BAS:2919-2929)
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
  for (let t = 1 - c.v0de0; t <= n + c.v0de4; t++) {
    if ((c.a1232.g(t, 1) <= 0 || c.a1232.g(t, 0) <= 0) && (t === n + 1 || t === 0)) {
      c.a1232.p(t, 0, c.a1260.g(Math.max(0, t - 1), 0));
      c.a1232.p(t, 1, c.a1260.g(Math.max(0, t - 1), 1));
    }
  }

  // forma (.FOR)
  const formaT = (t: number) =>
    t === 0 ? forma.balancoEsquerdo : t === n + 1 ? forma.balancoDireito : forma.tramos[t - 1];
  const apoios = extras.apoios ?? apoiosPadrao(entrada);
  for (let k = 0; k <= n; k++) {
    const a = apoios[k];
    c.a1926.p(k, 0, a?.largura ?? 0);
    c.a1954[k] = `${a?.tipo ?? "P"}${a?.titulo ?? ""}`;
    c.a1982.p(k, 0, a?.codigo ?? 1);
    c.a1982.p(k, 1, a?.lps ?? 0);
    c.a1982.p(k, 2, a?.dis ?? 0);
  }
  for (let t = 0; t <= n + 1; t++) {
    const f = formaT(t);
    c.a1926.p(t, 1, f?.vaoLivre ?? 0);
    c.a1a3a.p(t, 0, f?.pe ?? 0);
    c.a1a3a.p(t, 1, f?.hle ?? 0);
    c.a1a3a.p(t, 2, f?.pd ?? 0);
    c.a1a3a.p(t, 3, f?.hld ?? 0);
    const e = extras.eixos?.[t];
    const existe = f !== undefined && (t > 0 || c.v0de0 === 1);
    c.a19b0.p(t, e?.alinhamento ?? 0);
    c.a19de.p(t, e?.eixo ?? (existe ? c.a1926.g(Math.max(0, t - 1), 0) / 2 : 0));
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
    // R9 (dado do .DSP): as áreas 0,00 de φ4 e φ32 valem também no detalhamento
    if (modo === "corrigido" && area === 0) {
      area =
        b.bitola === 4 ? AREAS_DSP_CORRIGIDAS[4] : b.bitola === 32 ? AREAS_DSP_CORRIGIDAS[32] : 0;
    }
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

  montaDimensionamento(c, entrada, dim, extras);
  return c;
}

/** Apoios padrão a partir da forma do contrato (ver `ExtrasDesinit.apoios`). */
export function apoiosPadrao(entrada: EntradaDesdim): ApoioFormaViga[] {
  const { forma } = entrada;
  const n = entrada.viga.tramos.length;
  const larguras = forma.tramos.map((f) => f.larguraApoio);
  const ultima = forma.balancoDireito?.larguraApoio ?? larguras[n - 1] ?? 0;
  return Array.from({ length: n + 1 }, (_, k) => {
    const largura = k < n ? (larguras[k] ?? 0) : ultima;
    return { largura, tipo: "P", titulo: `P${k + 1}`, codigo: 1, lps: largura, dis: 0 };
  });
}

/** Grava no COMMON o que o DESDIM (S_113F7) deixa para o DESAUXDI/DESINIT: barras de
 *  tramos e apoios (A_128E, A_12BC), comprimidas, cortantes com alívio (A_1540) e
 *  estribos (A_1374, V_0ECE, V_0ED2). */
function montaDimensionamento(
  c: Comum,
  entrada: EntradaDesdim,
  dim: DimensionamentoViga,
  extras: ExtrasDesinit,
) {
  const n = c.v0ddc;
  const grava = (m: Comum["a128e"], i: number, f: FlexaoViga) => {
    const [n1, f1, n2, f2] = leArranjo(f.arranjo);
    m.p(i, 0, n1);
    m.p(i, 1, f1);
    m.p(i, 2, n2);
    m.p(i, 3, f2);
    m.p(i, 6, f.as);
    m.p(i, 7, f.asCompressao);
  };
  const comprimida = (dado: string | undefined, f: FlexaoViga, bw: number) =>
    dado ?? (f.asCompressao > 0 ? arranjoComprimido(c, f.asCompressao, bw) : "-");
  for (let t = 1; t <= n; t++) {
    const f = dim.tramos[t - 1]?.flexao;
    if (!f) continue;
    grava(c.a128e, t, f);
    c.a128e.p(t, 4, f.mk);
    c.a13a2[t] = comprimida(extras.comprimidaTramos?.[t - 1], f, c.a1232.g(t, 0));
  }
  const { ini, fim } = apoiosComNegativo(c);
  for (let k = ini; k <= fim; k++) {
    const f = dim.apoios[k];
    if (!f) continue;
    grava(c.a12bc, k, f);
    // M− do apoio (DESDIM.BAS:2842-2847); o DESAUXDI troca pela As efetiva antes de usar
    const mk = c.s(qb(c.a16de.g(k) < 0) * c.a16de.g(k) * 100 * c.v0fa2 * c.v0fa6);
    c.a12bc.p(k, 4, mk / 100);
    c.a13d0[k] = comprimida(extras.comprimidaApoios?.[k], f, c.a1260.g(k, 0));
  }

  // estribos (L_1661C, L_15433, L_16B55; DESDIM.BAS:3149-3175, 3336-3460)
  const dimT = (t: number): TramoDimensionado | undefined =>
    t === 0 ? dim.balancoEsquerdo : t === n + 1 ? dim.balancoDireito : dim.tramos[t - 1];
  const fimT = n + c.v0de4;
  // V_0E34 e V_0ED2 não são zerados no DESDIM (L_16976, L_1661C): ficam com o valor do
  // COMMON. Na primeira viga de uma sessão o DESENHO (iniciado por RUN, sem COMMON) passa
  // 0; numa viga seguinte do mesmo processamento vale o que DESINIT/DESIMP deixaram, que
  // depende do caminho percorrido. O contrato detalha uma viga por vez: 0.
  let v0e34 = 0;
  c.v0ece = 0;
  for (let t = 1 - c.v0de0; t <= fimT; t++) {
    const cis = dimT(t)?.cisalhamento;
    if (!cis) continue;
    const asw = Math.max(cis.aswEsquerda, cis.aswDireita);
    if (asw === 0) throw new ErroQB(11, "Division by zero (Asw 0 na escolha do estribo)");
    const bw = c.a1232.g(t, 0);
    const ramos = bw > c.v0f3e ? (bw > c.v0f42 ? 3 : 2) : 1;
    for (let i = 5; i >= 0; i--) {
      if ((ramos * c.area.g(i) * 200) / asw >= c.v18be) v0e34 = c.bitola.g(i);
    }
    if (v0e34 > c.v0ece) c.v0ece = v0e34;
  }
  c.v0ed2 = 0;
  for (let r = 5; r >= 0; r--) if (c.a142c.g(r, 1) === c.v0ece) c.v0ed2 = c.a142c.g(r, 0);
  for (let t = 1 - c.v0de0; t <= fimT; t++) {
    const cis = dimT(t)?.cisalhamento;
    if (!cis) continue;
    c.a1540.p(t, 0, cis.vkEsquerda);
    c.a1540.p(t, 1, cis.vkDireita);
    const e = cis.estribo;
    if (t !== 0) {
      c.a1374.p(t, 0, e.bitola);
      c.a1374.p(t, 2, e.espacamentoEsquerda);
    }
    if (t !== n + 1) {
      c.a1374.p(t, 6, e.bitola);
      c.a1374.p(t, 7, e.espacamentoDireita);
    }
    const bw = c.a1232.g(t, 0);
    const d = c.a1232.g(t, 1) - c.v0ea6;
    const s5 = espacamentoMinimo(c, bw, c.a1232.g(t, 1));
    c.a1374.p(t, 3, c.v0ed2);
    c.a1374.p(t, 5, s5);
    const ramos = bw > c.v0f3e ? (bw > c.v0f42 ? 3 : 2) : 1;
    const a = c.areaDaBitola(c.v0ed2);
    c.a1374.p(t, 8, (2 * ramos * a * 100) / s5);
    c.a1374.p(
      t,
      8,
      (((c.a1374.g(t, 8) / (bw * c.v0f66 * 100)) * c.v0ec6 * c.v0ebe +
        Math.sqrt(1000 * c.v0ec6 * c.v0eba) * c.k(0.00024)) *
        bw *
        d) /
        c.k(1.61),
    );
  }
}

/** Comprimento das posições e linhas do quadro de ferros, na ordem do DESINIT (L_20C2C,
 *  DESINIT.BAS:562-940): negativas, grampos negativos, positivas, grampos positivos,
 *  porta-estribos, pele e estribos. */
function posicoesDoQuadro(c: Comum): PosicaoDesinit[] {
  const s = c.s;
  const pos: PosicaoDesinit[] = [];
  let num = 0;
  const nome = () => `N${++num}`;
  const longitudinal = (
    m: Comum["a1af2"],
    dobras: Comum["a1b4e"],
    total: number,
    tipo: PosicaoBarra["tipo"],
  ) => {
    for (let i = 1; i <= total; i++) {
      const phi = m.g(i, 1);
      let comp = s(m.g(i, 3) - m.g(i, 2) + dobras.g(i, 0) + dobras.g(i, 1));
      if (c.v190e === "S") {
        const desconto = qbCint(phi * c.v18ca * c.k(0.04292));
        comp = s(
          desconto *
            (qb(phi > c.bitola.g(4) && dobras.g(i, 1) > 0) +
              qb(phi > c.bitola.g(4) && dobras.g(i, 0) > 0)) +
            comp,
        );
      }
      comp = s(c.int(comp));
      pos.push({
        nome: nome(),
        quantidade: m.g(i, 0),
        bitola: phi,
        comprimento: comp,
        inicio: m.g(i, 2),
        fim: m.g(i, 3),
        tipo,
        dobras: [dobras.g(i, 0), dobras.g(i, 1)],
      });
    }
  };
  const grampo = (m: Comum["a1bd8"], total: number) => {
    for (let i = 1; i <= total; i++) {
      const comp = s(c.int((m.g(i, 3) - m.g(i, 2)) * 2 + m.g(i, 5)));
      pos.push({
        nome: nome(),
        quantidade: m.g(i, 0),
        bitola: m.g(i, 1),
        comprimento: comp,
        inicio: m.g(i, 2),
        fim: m.g(i, 3),
        tipo: "grampo",
        dobras: [0, 0],
      });
    }
  };
  longitudinal(c.a1af2, c.a1b4e, c.v185e, "negativa");
  grampo(c.a1bd8, c.v1872);
  longitudinal(c.a1ac4, c.a1b20, c.v1866, "positiva");
  grampo(c.a1baa, c.v1876);
  for (let i = 1; i <= c.v1862; i++) {
    const b = c.a1b7c;
    pos.push({
      nome: nome(),
      quantidade: b.g(i, 0),
      bitola: b.g(i, 1),
      comprimento: s(b.g(i, 3) - b.g(i, 2)),
      inicio: b.g(i, 2),
      fim: b.g(i, 3),
      tipo: "porta-estribo",
      dobras: [0, 0],
    });
  }
  // pele: uma linha por bitola, comprimento total com emenda (L_22035)
  for (let linha = 1; linha <= c.v186e; linha++) {
    let conta = 0;
    let j = 0;
    for (j = 0; j <= 6; j++) {
      conta -= qb(c.a1a96.g(j) > 0);
      if (conta === linha) break;
    }
    const phi = j <= 6 ? c.bitola.g(j) : 0;
    let total = 0;
    let ini = Infinity;
    let fim = -Infinity;
    for (let t = 1 - c.v0de0; t <= c.v0ddc + c.v0de4; t++) {
      if (c.a1c34.g(t, 1) !== phi) continue;
      total = s(qbCint(c.a1c34.g(t, 3) - c.a1c34.g(t, 2)) * c.a1c34.g(t, 0) * 2 + total);
      ini = Math.min(ini, c.a1c34.g(t, 2));
      fim = Math.max(fim, c.a1c34.g(t, 3));
    }
    const trasp = s(
      -((qb(c.v18e2 > 100) * (c.v18e2 - 100) * phi) / 10 + qb(c.v18e2 < 100) * c.v18e2),
    );
    if (total > 1000) total = s(qbCint((total * trasp) / 1000) + total);
    pos.push({
      nome: nome(),
      quantidade: 1,
      bitola: phi,
      comprimento: total,
      inicio: ini,
      fim,
      tipo: "pele",
      dobras: [0, 0],
    });
  }
  // estribos: uma linha por posição numerada (L_227CA)
  let numeros = 0;
  for (let r = 1; r <= c.v186a; r++) numeros = Math.max(numeros, c.a1c06.g(r, 6));
  for (let p = 1; p <= numeros; p++) {
    let quantidade = 0;
    let comp = 0;
    let phi = 0;
    let ini = Infinity;
    let fim = -Infinity;
    for (let r = 1; r <= c.v186a; r++) {
      const e = c.a1c06;
      if (e.g(r, 6) !== p) continue;
      const meio = (e.g(r, 0) + e.g(r, 1)) / 2;
      let t = 1 - c.v0de0;
      for (; t <= c.v0ddc + c.v0de4; t++) {
        const f0 = c.a1a0c.g(t, 0);
        const f1 = c.a1a0c.g(t, 1);
        if (
          (meio < f1 && meio > f0) ||
          (e.g(r, 1) < f1 + 1 && e.g(r, 1) > f0 - 1) ||
          (e.g(r, 0) < f1 + 1 && e.g(r, 0) > f0 - 1)
        ) {
          break;
        }
      }
      const ramos = e.g(r, 4);
      const k = -qb(ramos === 1) * 1 - qb(ramos === 2) * (2 / 3) - qb(ramos === 3) * (3 / 5);
      comp = s(c.a1232.g(t, 1) - 2 * c.v0eaa + (c.a1232.g(t, 0) - 2 * c.v0eaa) * k);
      const b = e.g(r, 2);
      const idx = -(
        qb(b === c.bitola.g(5)) * 5 +
        qb(b === c.bitola.g(4)) * 4 +
        qb(b === c.bitola.g(3)) * 3 +
        qb(b === c.bitola.g(2)) * 2 +
        qb(b === c.bitola.g(1))
      );
      comp = s(c.int(comp * 2) + c.a1c62.g(idx, 4));
      quantidade = s((c.int((e.g(r, 1) - e.g(r, 0)) / e.g(r, 3)) + 1) * e.g(r, 4) + quantidade);
      phi = b;
      ini = Math.min(ini, e.g(r, 0));
      fim = Math.max(fim, e.g(r, 1));
    }
    pos.push({
      nome: nome(),
      quantidade,
      bitola: phi,
      comprimento: comp,
      inicio: ini,
      fim,
      tipo: "estribo",
      dobras: [0, 0],
    });
  }
  return pos;
}

/** Detalhamento com os dados que o contrato não traz (ver `ExtrasDesinit`). */
export function detalhaVigaDesinit(
  entrada: EntradaDesdim,
  dimensionamento: DimensionamentoViga,
  modo: ModoSistrut,
  extras: ExtrasDesinit = {},
): DetalhamentoDesinit {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  if (entrada.parametros.acidentaisEnvoltoria) {
    avisos.push(
      "Envoltória de acidentais: o detalhamento usa os esforços estáticos da análise; o original usa a envoltória (não portada).",
    );
  }
  const c = montaComum(entrada, dimensionamento, modo, extras);
  cortaBarras(c);
  for (let t = 1; t <= c.v0ddc; t++) {
    for (let g = 1; g <= c.a12ea.g(t, 0, 0); g++) {
      memoria.push({
        descricao: `Tramo ${t}, grupo ${g} de positivas: trecho necessário (decalagem e ancoragem)`,
        formula: `${c.a12ea.g(t, g, 1)} a ${c.a12ea.g(t, g, 2)} m do apoio esquerdo`,
        ref: "DESDIM.BAS:5172-5268 (DESAUXDI)",
      });
    }
  }
  faces(c);
  detalhaLongitudinal(c, modo);
  estribos(c);
  portaEstribos(c);
  const posicoes = posicoesDoQuadro(c);
  for (const p of posicoes) {
    memoria.push({
      descricao: `${p.nome} ${p.tipo}: ${p.quantidade} φ${p.bitola} de ${p.inicio} a ${p.fim} cm`,
      valor: p.comprimento,
      unidade: "cm",
      ref: "DESINIT.BAS:562-940 (quadro de ferros)",
    });
  }
  const trechosEstribo: TrechoEstribo[] = [];
  for (let r = 1; r <= c.v186a; r++) {
    const e = c.a1c06;
    trechosEstribo.push({
      inicio: e.g(r, 0),
      fim: e.g(r, 1),
      bitola: e.g(r, 2),
      espacamento: e.g(r, 3),
      ladoALado: e.g(r, 4),
      posicao: e.g(r, 6),
      quantidade: c.int((e.g(r, 1) - e.g(r, 0)) / e.g(r, 3)) + 1,
    });
  }
  return { nome: entrada.viga.nome, posicoes, trechosEstribo, avisos, memoria };
}

/** Detalhamento da viga (contrato `DetalhaViga`), com os padrões da tela do DESENHO para
 *  os dados de forma que o contrato não traz. */
export const detalhaViga: DetalhaViga = (entrada, dimensionamento, modo) =>
  detalhaVigaDesinit(entrada, dimensionamento, modo);
