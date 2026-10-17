// Ligação entre o resultado do cálculo e o detalhamento de armaduras: monta a
// entrada de detalharViga, detalharLaje e detalharPilar para cada elemento
// calculado e junta a tabela de aço da obra, com as repetições do
// pavimento-tipo. Funções puras: a tela, o relatório e o DXF de armação usam o
// mesmo resultado. O DetalhamentoContexto leva o detalhamento da obra às telas.
import { createContext } from "react";
import {
  detalharLaje,
  regrasLaje,
  type LajeDetalhamento,
  type LajeDetalhamentoEntrada,
} from "../calculo/detalhamento/lajes";
import {
  arranjoDetalhado,
  detalharPilar,
  regrasPilar,
  type LancePilarDetalhamento,
  type PilarDetalhamento,
} from "../calculo/detalhamento/pilares";
import {
  detalharViga,
  regrasDetalhamento,
  type VigaDetalhamento,
  type VigaDetalhamentoEntrada,
} from "../calculo/detalhamento/vigas";
import {
  PERDA_PADRAO,
  tabelaAco,
  type ItemAco,
  type TabelaAco,
} from "../calculo/detalhamento/tabelaAco";
import type { ResultadoLaje, ResultadoObra, ResultadoPilar, ResultadoViga } from "../calculo/fluxo";
import { areaBarra } from "../calculo/barras";
import { BORDO_OPOSTO, contatos, linhaDoBordo, TOL } from "../calculo/lajes/vinculacao";
import type { VigaMontada } from "../calculo/montagem";
import type { Barra } from "../calculo/tipos";
import { colineares, eixoDaViga, eixoDoBordo, sobreposicao } from "../dominio/gerar";
import { BORDOS, type Bordo, type Laje, type Obra, type Pavimento } from "../dominio/obra";
import { rotuloNivel } from "./calculo";

export interface DetalhamentoVigaObra {
  pavimentoId: string;
  pavimento: string;
  repeticoes: number;
  vigaId: string;
  nome: string;
  /** Seção e cobrimento, cm. */
  bw: number;
  h: number;
  cobrimento: number;
  /** Abscissa de cada nó a partir do primeiro, cm (a mesma origem dos x das posições). */
  nos: number[];
  /** Largura de cada apoio na direção da viga, cm (0 na ponta livre). */
  larguraApoios: number[];
  /** Nome de cada apoio (pilar ou viga), na ordem dos nós; "" na ponta livre. */
  nomesApoios: string[];
  detalhamento: VigaDetalhamento;
}

export interface DetalhamentoVigasObra {
  vigas: DetalhamentoVigaObra[];
  /** Posições de todas as vigas, com a quantidade já multiplicada pelas repetições. */
  itens: ItemAco[];
  /** Tabela de aço só das vigas (perda padrão). */
  tabela: TabelaAco;
}

/**
 * Largura de cada apoio da viga na direção dela, cm: pilar → b se a viga é
 * horizontal (b é a dimensão em x), h se vertical; viga de apoio → bw dela;
 * ponta livre → 0.
 */
export function larguraApoios(v: VigaMontada, pav: Pavimento): number[] {
  return v.apoios.map((a) => {
    if (a.tipo === "livre") return 0;
    if (a.tipo === "viga") return pav.vigas.find((x) => x.id === a.id)?.bw ?? 0;
    const p = pav.pilares.find((x) => x.id === a.id);
    if (!p) return 0;
    return v.eixo.horizontal ? p.b : p.h;
  });
}

/** Nome de cada apoio da viga (pilar ou viga de apoio); "" na ponta livre ou se o
 *  elemento não está mais no pavimento. */
export function nomesApoios(v: VigaMontada, pav: Pavimento): string[] {
  return v.apoios.map((a) => {
    if (a.tipo === "livre") return "";
    const lista = a.tipo === "viga" ? pav.vigas : pav.pilares;
    return lista.find((x) => x.id === a.id)?.nome ?? "";
  });
}

/** Entrada de detalharViga de uma viga calculada; null se a análise não fechou. */
export function entradaDetalhamentoViga(
  r: ResultadoViga,
  pav: Pavimento,
  resultado: ResultadoObra,
  cobrimento: number,
): VigaDetalhamentoEntrada | null {
  if (!r.analise.ok || r.tramos.length === 0) return null;
  return {
    nome: r.viga.nome,
    bw: r.viga.bw,
    h: r.viga.h,
    d: r.d,
    cobrimento,
    larguraApoios: larguraApoios(r.viga, pav),
    tramos: r.analise.tramos,
    dimensionamento: r.tramos,
    // o mesmo γf do dimensionamento (fluxo.ts dimensionarViga)
    gamaF: Math.max(resultado.norma.gamaG, resultado.norma.gamaQ),
    mat: resultado.materiais,
  };
}

/** Itens de aço das posições, com a quantidade multiplicada por `repeticoes`. */
export const itensAco = (posicoes: readonly ItemAco[], repeticoes = 1): ItemAco[] =>
  posicoes.map((p) => ({
    phi: p.phi,
    quantidade: p.quantidade * repeticoes,
    comprimento: p.comprimento,
    ...(p.aco ? { aco: p.aco } : {}),
  }));

/**
 * Tabela de aço a partir dos itens de todas as origens (vigas, lajes,
 * pilares). Os itens já vêm com as repetições do pavimento-tipo.
 */
export const tabelaAcoObra = (
  origens: readonly (readonly ItemAco[])[],
  perda = PERDA_PADRAO,
): TabelaAco => tabelaAco(origens.flat(), perda);

/** Abscissa de cada nó, cm, somando os vãos como detalharViga faz. */
function abscissasNos(e: VigaDetalhamentoEntrada) {
  const nos = [0];
  for (const t of e.tramos) nos.push((nos.at(-1) ?? 0) + t.comprimento * 100);
  return nos;
}

/** Detalha todas as vigas calculadas da obra e soma a tabela de aço delas. */
export function detalharVigasObra(resultado: ResultadoObra, obra: Obra): DetalhamentoVigasObra {
  const regras = regrasDetalhamento(resultado.norma.id);
  const cobrimento = obra.materiais.cobrimentoViga;
  const vigas: DetalhamentoVigaObra[] = [];
  for (const rp of resultado.pavimentos) {
    const pav = rp.pavimento;
    for (const r of rp.vigas) {
      const entrada = entradaDetalhamentoViga(r, pav, resultado, cobrimento);
      if (!entrada) continue;
      vigas.push({
        pavimentoId: pav.id,
        pavimento: pav.nome,
        repeticoes: pav.repeticoes,
        vigaId: r.viga.id,
        nome: r.viga.nome,
        bw: entrada.bw,
        h: entrada.h,
        cobrimento,
        nos: abscissasNos(entrada),
        larguraApoios: entrada.larguraApoios,
        nomesApoios: nomesApoios(r.viga, pav),
        detalhamento: detalharViga(entrada, regras),
      });
    }
  }
  const itens = vigas.flatMap((v) => itensAco(v.detalhamento.posicoes, v.repeticoes));
  return { vigas, itens, tabela: tabelaAcoObra([itens]) };
}

// ---- lajes ------------------------------------------------------------------------

export interface DetalhamentoLajeObra {
  pavimentoId: string;
  pavimento: string;
  repeticoes: number;
  lajeId: string;
  nome: string;
  /** Vãos teóricos, m; espessura e cobrimento, cm. */
  lx: number;
  ly: number;
  h: number;
  cobrimento: number;
  /** Bordos cuja negativa saiu no detalhamento da laje vizinha. */
  negativoNaVizinha: Bordo[];
  detalhamento: LajeDetalhamento;
}

export interface DetalhamentoLajesObra {
  lajes: DetalhamentoLajeObra[];
  /** Posições de todas as lajes, com a quantidade já multiplicada pelas repetições. */
  itens: ItemAco[];
  /** Tabela de aço só das lajes (perda padrão). */
  tabela: TabelaAco;
}

/** Largura da viga sob cada bordo da laje, cm: a maior bw das vigas colineares
 *  ao bordo que se sobrepõem a ele; 0 sem viga. */
export function larguraBordos(laje: Laje, pav: Pavimento): Record<Bordo, number> {
  const largura = (b: Bordo) => {
    const eb = eixoDoBordo(laje, b);
    let bw = 0;
    for (const v of pav.vigas) {
      const ev = eixoDaViga(v);
      if (ev && colineares(ev, eb) && sobreposicao(ev.s1, ev.s2, eb.s1, eb.s2) > TOL)
        bw = Math.max(bw, v.bw);
    }
    return bw;
  };
  return {
    esquerdo: largura("esquerdo"),
    inferior: largura("inferior"),
    direito: largura("direito"),
    superior: largura("superior"),
  };
}

const temBarra = (b: Barra | undefined): b is Barra => !!b && b.phi > 0 && b.espacamento > 0;

/** Área efetiva da barra de laje, cm²/m. */
const asEfetiva = (b: Barra) => (areaBarra(b.phi) * 100) / b.espacamento;

/**
 * Entradas de detalharLaje das lajes de um pavimento, na ordem dele. Para cada
 * bordo engastado com laje do outro lado (também engastada):
 * - `vaoMenorVizinha` = o maior dos menores vãos das vizinhas daquele bordo;
 * - `hVizinhaMin` = a menor espessura das vizinhas daquele bordo: a negativa
 *   entra nelas, e o gancho (h − 2c) tem de caber na mais fina, também no
 *   contato parcial, em que as duas lajes detalham a negativa;
 * - a negativa do bordo comum sai uma vez só quando uma barra serve às duas
 *   lajes. Cada laje dimensiona o mesmo X com o próprio d, então a As e o
 *   gancho (h − 2c, perna vertical na espessura) mudam de uma para a outra:
 *   - bordos que coincidem (mesmo trecho nas duas): detalha a laje de menor h
 *     (empate: a primeira da lista), para o gancho caber nas duas, com a maior
 *     As necessária e a barra de maior As efetiva das duas; a outra marca o
 *     bordo em `negativoNaVizinha`;
 *   - bordo coberto inteiro por um bordo maior da vizinha: a vizinha detalha o
 *     dela, e este só é marcado se a barra dela atende aqui (As necessária e As
 *     efetiva dela ≥ As necessária daqui e h dela ≤ h daqui);
 *   - contato parcial, ou barra que não atende: as duas detalham (sobra aço no
 *     trecho comum, mas não falta).
 *   A laje com o bordo oposto livre (balanço) nunca é marcada: a negativa dela
 *   vai até a ponta, e a da vizinha não. Nos bordos que coincidem, o balanço
 *   detalha (com a maior As das duas) e a vizinha é marcada, qualquer que seja o h.
 */
export function entradasDetalhamentoLajes(
  lajes: readonly ResultadoLaje[],
  pav: Pavimento,
  resultado: ResultadoObra,
  cobrimento: number,
): LajeDetalhamentoEntrada[] {
  const indice = new Map(lajes.map((r, i) => [r.laje.id, i]));
  const vizinhas = contatos(lajes.map((r) => r.laje)).filter((c) => c.sobreposicao > TOL);
  const engastado = (i: number, b: Bordo) => lajes[i]?.entrada.vinculos[b] === "engastado";
  const comprimento = (i: number, b: Bordo) => {
    const l = lajes[i];
    if (!l) return 0;
    const linha = linhaDoBordo(l.laje, b);
    return linha.fim - linha.inicio;
  };
  /** Negativa de um bordo como o cálculo da laje a deu. */
  const negativa = (i: number, b: Bordo) => {
    const r = lajes[i];
    const barra = r?.armadura.barrasNegativos[b];
    if (!r || !temBarra(barra)) return null;
    return { barra, as: r.armadura.asNegativos[b], h: r.entrada.h };
  };
  /** A negativa n detalhada na laje j (bordo kj) atende a laje i no bordo k? */
  const atende = (n: { barra: Barra; as: number; h: number }, i: number, k: Bordo) => {
    const propria = negativa(i, k);
    if (!propria) return true;
    return n.as >= propria.as - 1e-9 && asEfetiva(n.barra) >= propria.as - 1e-9 && n.h <= propria.h;
  };
  const balanco = (i: number, k: Bordo) => lajes[i]?.entrada.vinculos[BORDO_OPOSTO[k]] === "livre";

  const vaosMenores = lajes.map(() => ({}) as Partial<Record<Bordo, number>>);
  const hMinimos = lajes.map(() => ({}) as Partial<Record<Bordo, number>>);
  /** Bordos cuja negativa sai na vizinha, "i|bordo". */
  const naVizinha = new Set<string>();
  /** Negativa unificada (barra e As) do bordo que detalha pelas duas lajes, "i|bordo". */
  const unificadas = new Map<string, { barra: Barra; as: number }>();
  lajes.forEach((r, i) => {
    for (const k of BORDOS) {
      if (!engastado(i, k)) continue;
      for (const c of vizinhas) {
        if (c.laje !== r.laje.id || c.bordo !== k) continue;
        const j = indice.get(c.vizinha);
        const e = j === undefined ? undefined : lajes[j]?.entrada;
        if (j === undefined || !e) continue;
        // a negativa entra na vizinha mesmo que ela esteja apoiada nesse bordo
        const hs = hMinimos[i] ?? {};
        hs[k] = Math.min(hs[k] ?? Number.POSITIVE_INFINITY, e.h);
        if (!engastado(j, c.bordoVizinha)) continue;
        const vaos = vaosMenores[i] ?? {};
        vaos[k] = Math.max(vaos[k] ?? 0, Math.min(e.lx, e.ly));
        const ni = negativa(i, k);
        const nj = negativa(j, c.bordoVizinha);
        if (!ni || !nj) continue;
        const cobreI = c.sobreposicao >= comprimento(i, k) - TOL;
        const cobreJ = c.sobreposicao >= comprimento(j, c.bordoVizinha) - TOL;
        if (cobreI && cobreJ) {
          // bordos coincidentes: cada par é visto duas vezes; decide na primeira
          if (j < i) continue;
          const bi = balanco(i, k);
          const bj = balanco(j, c.bordoVizinha);
          // dois balanços frente a frente: cada um leva a sua até a própria ponta
          if (bi && bj) continue;
          // o balanço detalha (a negativa dele vai até a ponta); senão, a de menor h
          const iDetalha = bi || (!bj && ni.h <= nj.h);
          const [d, kd, o, ko] = iDetalha ? [i, k, j, c.bordoVizinha] : [j, c.bordoVizinha, i, k];
          const [nd, no] = iDetalha ? [ni, nj] : [nj, ni];
          naVizinha.add(`${o}|${ko}`);
          if (no.as > nd.as || asEfetiva(no.barra) > asEfetiva(nd.barra))
            unificadas.set(`${d}|${kd}`, {
              barra: asEfetiva(no.barra) > asEfetiva(nd.barra) ? no.barra : nd.barra,
              as: Math.max(nd.as, no.as),
            });
        } else if (cobreI && !balanco(i, k) && atende(nj, i, k)) {
          // o bordo maior da vizinha detalha a negativa dela, que serve aqui
          naVizinha.add(`${i}|${k}`);
        }
      }
    }
  });

  return lajes.map((r, i) => {
    const negativoNaVizinha = BORDOS.filter((k) => naVizinha.has(`${i}|${k}`));
    let armadura = r.armadura;
    for (const k of BORDOS) {
      const u = unificadas.get(`${i}|${k}`);
      if (!u) continue;
      armadura = {
        ...armadura,
        asNegativos: { ...armadura.asNegativos, [k]: u.as },
        barrasNegativos: { ...armadura.barrasNegativos, [k]: u.barra },
      };
    }
    return {
      nome: r.laje.nome,
      lx: r.entrada.lx,
      ly: r.entrada.ly,
      h: r.entrada.h,
      cobrimento,
      vinculos: r.entrada.vinculos,
      larguraApoios: larguraBordos(r.laje, pav),
      armadura,
      reacoes: r.esforcos.reacoes,
      // o mesmo γf das vigas: máx(γg, γq)
      gamaF: Math.max(resultado.norma.gamaG, resultado.norma.gamaQ),
      vaoMenorVizinha: vaosMenores[i] ?? {},
      hVizinhaMin: hMinimos[i] ?? {},
      negativoNaVizinha,
      mat: resultado.materiais,
    };
  });
}

/** Detalha todas as lajes calculadas da obra e soma a tabela de aço delas. */
export function detalharLajesObra(resultado: ResultadoObra, obra: Obra): DetalhamentoLajesObra {
  const regras = regrasLaje(resultado.norma.id);
  const cobrimento = obra.materiais.cobrimentoLaje;
  const lajes: DetalhamentoLajeObra[] = [];
  for (const rp of resultado.pavimentos) {
    const pav = rp.pavimento;
    const entradas = entradasDetalhamentoLajes(rp.lajes, pav, resultado, cobrimento);
    rp.lajes.forEach((r, i) => {
      const entrada = entradas[i];
      if (!entrada) return;
      const detalhamento = detalharLaje(entrada, regras);
      // bordo comum detalhado aqui por uma barra que serve às duas lajes
      for (const k of BORDOS) {
        const barra = entrada.armadura.barrasNegativos[k];
        const as = entrada.armadura.asNegativos[k];
        if (!barra || (barra === r.armadura.barrasNegativos[k] && as === r.armadura.asNegativos[k]))
          continue;
        detalhamento.memoria.push({
          descricao: `Negativa do bordo ${k} pelas duas lajes do bordo comum: maior As necessária, barra φ ${rotuloPhi(barra.phi)} c/ ${rotuloPhi(barra.espacamento)} (maior As efetiva) e gancho pela menor espessura (h = ${entrada.h} cm, desta laje)`,
          formula: `As = máx(As desta laje = ${r.armadura.asNegativos[k].toFixed(2)}; As da vizinha)`,
          valor: as,
          unidade: "cm²/m",
          ref: "Bordo comum: cada laje dimensiona o mesmo X com o próprio d",
        });
      }
      lajes.push({
        pavimentoId: pav.id,
        pavimento: pav.nome,
        repeticoes: pav.repeticoes,
        lajeId: r.laje.id,
        nome: r.laje.nome,
        lx: entrada.lx,
        ly: entrada.ly,
        h: entrada.h,
        cobrimento,
        negativoNaVizinha: [...(entrada.negativoNaVizinha ?? [])],
        detalhamento,
      });
    });
  }
  const itens = lajes.flatMap((l) => itensAco(l.detalhamento.posicoes, l.repeticoes));
  return { lajes, itens, tabela: tabelaAcoObra([itens]) };
}

// ---- pilares ----------------------------------------------------------------------

export interface LanceDetalhadoObra {
  /** Rótulo do nível, como na tabela de pilares ("Tipo (2/3)"). */
  nivel: string;
  pavimentoId: string;
  repeticao: number;
  /** Pé-direito do lance e seção, cm. */
  peDireito: number;
  b: number;
  h: number;
  /** Barras em cada face de comprimento h (porFaceX) e b (porFaceY), cantos
   *  incluídos, como o detalhamento usou. */
  porFaceX: number;
  porFaceY: number;
  /** De onde veio o número de barras por face: do arranjo que o cálculo do pilar
   *  verificou ou, se ele não fecha com n, da distribuição padrão do motor
   *  (arranjoBarras da V1). */
  arranjo: "resultado" | "padrao";
  /** Quanto as barras deste lance passam do topo dele (traspasse com o lance de
   *  cima, já arredondado), cm; null no último lance ou sem barras. */
  traspasse: number | null;
  /** Seção retangular b × h (false: seção em L, T ou U, que a tela não desenha). */
  retangular: boolean;
}

export interface DetalhamentoPilarObra {
  /** Posição do pilar na planta ("x;y", m), a mesma em todos os níveis. */
  chave: string;
  nome: string;
  cobrimento: number;
  /** Da base para o topo; o índice é o `tramo` das posições. */
  lances: LanceDetalhadoObra[];
  detalhamento: PilarDetalhamento;
}

export interface DetalhamentoPilaresObra {
  pilares: DetalhamentoPilarObra[];
  /** Posições de todos os pilares (cada repetição já é um lance: sem multiplicar). */
  itens: ItemAco[];
  /** Tabela de aço só dos pilares (perda padrão). */
  tabela: TabelaAco;
}

/** O mesmo pilar em níveis diferentes é casado pela posição (como em fluxo.ts). */
const chavePilar = (p: { x: number; y: number }) => `${p.x.toFixed(3)};${p.y.toFixed(3)}`;

/**
 * Níveis de cada pilar, da base para o topo. Os níveis vêm de calcularObra (do
 * topo para a base, um por repetição); o pilar é o mesmo em níveis consecutivos
 * na mesma posição. Se ele falta num nível intermediário, o trecho de baixo e o
 * de cima viram pilares separados.
 */
export function lancesPilares(resultado: ResultadoObra) {
  const niveis: string[] = [];
  for (const rp of resultado.pavimentos)
    for (let k = 1; k <= rp.pavimento.repeticoes; k++) niveis.push(`${rp.pavimento.id}|${k}`);
  const grupos: { chave: string; ultimo: number; niveis: ResultadoPilar[] }[] = [];
  const abertos = new Map<string, (typeof grupos)[number]>();
  for (const p of [...resultado.pilares].reverse()) {
    const chave = chavePilar(p.pilar);
    const n = niveis.indexOf(`${p.pavimentoId}|${p.repeticao}`);
    const g = abertos.get(chave);
    if (g && g.ultimo === n + 1) {
      g.niveis.push(p);
      g.ultimo = n;
      continue;
    }
    const novo = { chave, ultimo: n, niveis: [p] };
    grupos.push(novo);
    abertos.set(chave, novo);
  }
  return grupos.map((g) => ({ chave: g.chave, niveis: g.niveis }));
}

/** Detalha todos os pilares da obra, lance a lance, e soma a tabela de aço deles. */
export function detalharPilaresObra(resultado: ResultadoObra, obra: Obra): DetalhamentoPilaresObra {
  const regras = regrasPilar(resultado.norma.id);
  const cobrimento = obra.materiais.cobrimentoPilar;
  const peDireito = (id: string) =>
    (resultado.pavimentos.find((rp) => rp.pavimento.id === id)?.pavimento.peDireito ?? 0) * 100;
  const pilares = lancesPilares(resultado).map((g): DetalhamentoPilarObra => {
    const entradas = g.niveis.map((p): LancePilarDetalhamento => ({
      peDireito: peDireito(p.pavimentoId),
      b: p.pilar.b,
      h: p.pilar.h,
      ...(p.pilar.secao ? { secao: p.pilar.secao } : {}),
      resultado: p.resultado,
    }));
    const nome = g.niveis[0]?.pilar.nome ?? "";
    const detalhamento = detalharPilar(
      { nome, cobrimento, lances: entradas, mat: resultado.materiais },
      regras,
    );
    const lances = g.niveis.map((p, i): LanceDetalhadoObra => {
      const pe = entradas[i]?.peDireito ?? 0;
      const arranjo = arranjoDetalhado(p.resultado.barras, p.pilar.b, p.pilar.h);
      const longitudinal = detalhamento.posicoes.find(
        (x) => x.tramo === i && x.tipo === "longitudinal",
      );
      return {
        nivel: rotuloNivel(resultado, p),
        pavimentoId: p.pavimentoId,
        repeticao: p.repeticao,
        peDireito: pe,
        b: p.pilar.b,
        h: p.pilar.h,
        porFaceX: arranjo.porFaceX,
        porFaceY: arranjo.porFaceY,
        arranjo: arranjo.origem,
        traspasse: longitudinal && i < g.niveis.length - 1 ? longitudinal.reto - pe : null,
        retangular: !p.pilar.secao,
      };
    });
    return { chave: g.chave, nome, cobrimento, lances, detalhamento };
  });
  const itens = pilares.flatMap((p) => itensAco(p.detalhamento.posicoes));
  return { pilares, itens, tabela: tabelaAcoObra([itens]) };
}

// ---- obra --------------------------------------------------------------------------

/** Detalhamento da obra inteira: estende o das vigas (o DXF de armação usa só
 *  ele) com o das lajes, o dos pilares e a tabela de aço das três origens. */
export interface DetalhamentoObra extends DetalhamentoVigasObra {
  lajes: DetalhamentoLajesObra;
  pilares: DetalhamentoPilaresObra;
  /** Tabela de aço da obra inteira: vigas + lajes + pilares (perda padrão). */
  tabelaObra: TabelaAco;
}

/** Detalha vigas, lajes e pilares da obra calculada. */
export function detalharObra(resultado: ResultadoObra, obra: Obra): DetalhamentoObra {
  const vigas = detalharVigasObra(resultado, obra);
  const lajes = detalharLajesObra(resultado, obra);
  const pilares = detalharPilaresObra(resultado, obra);
  return {
    ...vigas,
    lajes,
    pilares,
    tabelaObra: tabelaAcoObra([vigas.itens, lajes.itens, pilares.itens]),
  };
}

/** Detalhamento da obra calculada para as telas; null sem cálculo (os blocos não aparecem). */
export const DetalhamentoContexto = createContext<DetalhamentoObra | null>(null);

/** Bitola para rótulo: "10", "6,3", "12,5". */
export const rotuloPhi = (phi: number) => String(phi).replace(".", ",");

/** Rótulo de desenho de uma posição: "N1 2φ10 c=345"; estribo com o
 *  espaçamento: "N4 22φ5 c/18 c=94". Comprimento em cm. */
export function rotuloPosicao(p: {
  nome: string;
  quantidade: number;
  phi: number;
  comprimento: number;
  espacamento?: number | null;
}) {
  const s = p.espacamento ? ` c/${rotuloPhi(p.espacamento)}` : "";
  return `${p.nome} ${p.quantidade}φ${rotuloPhi(p.phi)}${s} c=${p.comprimento}`;
}
