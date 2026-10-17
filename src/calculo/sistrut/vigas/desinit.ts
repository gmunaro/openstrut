// Detalhamento da viga como o SISTRUT 4.0 faz (DESAUXDI do DESDIM + DESINIT): corte das
// barras sobre o diagrama de 21 pontos, ancoragem por τbu, dobras, grampos, pele,
// porta-estribos, trechos de estribos e o comprimento de cada posição como o quadro de
// ferros do DESINIT o calcula (FUN_2000_2FE8, DESINIT.BAS:562-700).
// Especificação: livros_arm_forma_des.md 4.3; PLANO D7, D8 e R11.
//
// `detalhaViga` implementa o contrato `DetalhaViga`. O que o DESINIT lê do .FOR e da
// tela do DESENHO e `EntradaDesdim` não traz vem em `extras` (`ExtrasDesinit`); sem
// eles, valem os padrões da tela do DESENHO.
// Os esforços vêm do DESCALC portado (`analisaDescalc`, `desinitDescalc.ts`), refeito a
// partir de `entrada.viga` como o DESDIM faz, com a envoltória das acidentais; é o
// mesmo DESCALC que o dimensionamento (`desdim.ts`) usa. O Mk dos tramos e o Vk com
// alívio gravados no COMMON também saem dele.
import { nomeArquivoEdv } from "../../../dominio/edicaoViga";
import { numAte } from "../../texto";
import type {
  ApoioFormaViga,
  DetalhaViga,
  DimensionamentoParaDetalhe,
  EntradaDesdim,
  ExtrasDesinit,
  ModoSistrut,
  PosicaoBarra,
  TrechoEstribo,
} from "../base/tipos";
import type { Etapa } from "../../tipos";
import { ErroQB, qbCint, qbStr } from "../base/f32";
import { type Comum, qb } from "./desinitComum";
import { apoiosComNegativo, cortaBarras } from "./desinitCorte";
import { analisaDescalc } from "./desinitDescalc";
import { detalhaLongitudinal, estribos, faces, portaEstribos, qbVal } from "./desinitBarras";
import {
  aplicaEdicao,
  comprimentoMudou,
  conferenciaAsEditada,
  motivosEdicaoNaoServe,
} from "./desinitEdicao";

type TramoParaDetalhe = DimensionamentoParaDetalhe["tramos"][number];
type FlexaoParaDetalhe = DimensionamentoParaDetalhe["apoios"][number];

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

/** Monta o COMMON (`Comum`) como o DESDIM o deixa para o DESAUXDI e o DESINIT: a
 *  viga, as seções e o .DSP com o DESCALC rodado (`analisaDescalc`, o mesmo que o
 *  dimensionamento usa), a forma (.FOR) e o dimensionamento. */
export function montaComum(
  entrada: EntradaDesdim,
  dim: DimensionamentoParaDetalhe,
  modo: ModoSistrut,
  extras: ExtrasDesinit = {},
) {
  const c = analisaDescalc(entrada, modo);
  formaNoComum(c, entrada, extras);
  montaDimensionamento(c, dim, extras);
  return c;
}

/** A forma (.FOR) no COMMON: apoios, vãos livres, lajes no corte e eixos (o que o DESINIT
 *  usa para as faces, S_30132, e para o quadro). */
function formaNoComum(c: Comum, entrada: EntradaDesdim, extras: ExtrasDesinit) {
  const { forma } = entrada;
  const n = c.v0ddc;

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
function montaDimensionamento(c: Comum, dim: DimensionamentoParaDetalhe, extras: ExtrasDesinit) {
  const n = c.v0ddc;
  const grava = (m: Comum["a128e"], i: number, f: FlexaoParaDetalhe) => {
    const [n1, f1, n2, f2] = leArranjo(f.arranjo);
    m.p(i, 0, n1);
    m.p(i, 1, f1);
    m.p(i, 2, n2);
    m.p(i, 3, f2);
    m.p(i, 6, f.as);
    m.p(i, 7, f.asCompressao);
  };
  const comprimida = (dado: string | undefined, f: FlexaoParaDetalhe, bw: number) =>
    dado ?? (f.asCompressao > 0 ? arranjoComprimido(c, f.asCompressao, bw) : "-");
  for (let t = 1; t <= n; t++) {
    const f = dim.tramos[t - 1]?.flexao;
    if (!f) continue;
    grava(c.a128e, t, f);
    // M+ do detalhamento: o da envoltória ou o de engastamento perfeito, o maior
    // (DESDIM.BAS:2934-2953); `f.mk` deve ser o mesmo número
    let m = c.s(c.a1768.g(t) * 100);
    for (let i = 1; i <= c.v1176; i++) {
      if (c.a11d6.g(i) === t) {
        m = c.s(Math.max(m, c.s(c.a11a8.g(i) * 100)));
        break;
      }
    }
    m = c.s(m * c.v0fa2 * c.v0fa6);
    c.a128e.p(t, 4, m / 100);
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
  const dimT = (t: number): TramoParaDetalhe | undefined =>
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
        c.raiz(1000 * c.v0ec6 * c.v0eba) * c.k(0.00024)) *
        bw *
        d) /
        c.k(1.61),
    );
  }
}

/** Comprimento das posições e linhas do quadro de ferros, na ordem do DESINIT (L_20C2C,
 *  DESINIT.BAS:562-940): negativas, grampos negativos, positivas, grampos positivos,
 *  porta-estribos, pele e estribos. */
function posicoesDoQuadro(c: Comum): PosicaoBarra[] {
  const s = c.s;
  const pos: PosicaoBarra[] = [];
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

/** Detalhamento da viga (contrato `DetalhaViga`): corte, ancoragem, estribos e o quadro
 *  de ferros. `extras` = dados do .FOR e da tela do DESENHO (`ExtrasDesinit`); sem
 *  eles, os padrões da tela. */
export const detalhaViga: DetalhaViga = (entrada, dimensionamento, modo, extras = {}) => {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const edicao = extras.armaduraEditada;
  // reabertura da viga editada (DESEDITA → DESINIT): sem DESDIM, o DESINIT só refaz as
  // faces (S_30132) e o quadro com os arrays do .EDV (DESINIT.BAS:114-140)
  const reabre = extras.reabreEdicao === true && edicao !== undefined;
  const c = reabre
    ? analisaDescalc(entrada, modo)
    : montaComum(entrada, dimensionamento, modo, extras);
  if (reabre) formaNoComum(c, entrada, extras);
  else cortaBarras(c);
  for (let t = 1; t <= (reabre ? 0 : c.v0ddc); t++) {
    for (let g = 1; g <= c.a12ea.g(t, 0, 0); g++) {
      memoria.push({
        descricao: `Tramo ${t}, grupo ${g} de positivas: trecho necessário (decalagem e ancoragem)`,
        formula: `${c.a12ea.g(t, g, 1)} a ${c.a12ea.g(t, g, 2)} m do apoio esquerdo`,
        ref: "DESDIM.BAS:5172-5268 (DESAUXDI)",
      });
    }
  }
  faces(c);
  if (!reabre) {
    detalhaLongitudinal(c, modo);
    estribos(c);
    portaEstribos(c);
  }
  if (edicao) {
    const arquivo = nomeArquivoEdv(edicao.registro, edicao.pavimento);
    const motivos = motivosEdicaoNaoServe(c, edicao);
    // comprimento: o original não confere (DESEDITA.BAS:747) e aplica a edição sobre a
    // viga atual; o corrigido descarta a edição que não é da viga atual
    const comprimento = comprimentoMudou(c, edicao);
    if (comprimento && modo === "corrigido") motivos.push(comprimento);
    if (motivos.length > 0 && reabre)
      throw new Error(
        `a armadura editada no SISTRUT (${arquivo}) não serve à viga, que mudou depois da edição (${motivos.join("; ")})`,
      );
    if (motivos.length > 0) {
      avisos.push(
        `${entrada.viga.nome}: a armadura editada no SISTRUT (${arquivo}) foi descartada porque a viga mudou depois da edição (${motivos.join("; ")}); valem o detalhamento e o quadro automáticos.`,
      );
    } else {
      aplicaEdicao(c, edicao);
      if (comprimento)
        avisos.push(
          `${entrada.viga.nome}: a viga mudou depois da edição (${comprimento}); como o original, que não confere o comprimento ao reabrir a viga editada (DESEDITA.BAS:747), a armadura editada no SISTRUT (${arquivo}) foi aplicada à viga atual. Confira se as barras ainda alcançam os apoios.`,
        );
      memoria.push({
        descricao: `Armadura editada no DESEDCAO (${arquivo}) no lugar da automática: ${edicao.negativas.length} negativas, ${edicao.positivas.length} positivas, ${edicao.portaEstribos.length} porta-estribos, ${edicao.estribos.length} trechos de estribo`,
        ref: "DESINIT.BAS:132-140, 404-966 (S_202b9 com os arrays do DESEDCAO)",
      });
      if (modo === "corrigido" && !reabre)
        avisos.push(...conferenciaAsEditada(c, edicao, dimensionamento));
    }
  }
  const posicoes = posicoesDoQuadro(c);
  for (const p of posicoes) {
    memoria.push({
      descricao: `${p.nome} ${p.tipo}: ${p.quantidade} φ${numAte(p.bitola, 1)} de ${numAte(p.inicio, 1)} a ${numAte(p.fim, 1)} cm`,
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
};
