// Levantamento do orçamento: as quantidades de cada elemento da obra calculada, no
// formato que dominio/orcamento.ts recebe.
// - Concreto e fôrma: as mesmas funções e a mesma escolha de calcularQuantitativos
//   (calculo/quantitativos.ts, quantPavimento), elemento a elemento; o teste confere
//   que a soma bate com os quantitativos por pavimento e tipo.
// - Aço: as barras do detalhamento (telas/detalhamento.ts), por categoria e bitola,
//   com ganchos e ancoragens e sem perda (o orçamento aplica a dele). É a "Tabela de
//   aço" da aba Resultados, não a estimativa do resumo de aço e concreto.
// - Fundação (NB-1/78): a carga na fundação de cada coluna que nasce na fundação
//   (resumo do PILAREDI, t). A NBR 6118 da V2 não tem esse resumo.
import { massaLinear } from "../../calculo/detalhamento/tabelaAco";
import type { ResultadoObra } from "../../calculo/fluxo";
import {
  espessuraLajeNaViga,
  quantLaje,
  quantPilar,
  quantViga,
  quantVigaDesinit,
} from "../../calculo/quantitativos";
import { encontroNoPilar } from "../../calculo/formas";
import type { ElementoQuant, Levantamento, MassaAco } from "../../dominio/orcamento";
import type { Aco, ModoCalculo, Obra } from "../../dominio/obra";
import { calcular } from "../calculo";
import { detalharObra, type DetalhamentoObra } from "../detalhamento";

/** Nome e id do grupo das fundações no orçamento (não é pavimento da obra; o id não
 *  colide com o de um pavimento, que é um UUID). */
export const PAVIMENTO_FUNDACAO = "Fundação";
export const ID_FUNDACAO = "fundacao";

export interface LevantamentoObra extends Levantamento {
  /** Carga total na fundação, t (NB-1/78); null sem o resumo do SISTRUT. */
  cargaFundacao: number | null;
  /** Elementos sem barras no detalhamento (o aço deles fica fora). */
  semAco: string[];
  /** O que ficou fora do levantamento e por quê. */
  avisos: string[];
}

interface Posicao {
  phi: number;
  quantidade: number;
  comprimento: number;
  aco?: Aco;
}

/** Massa por categoria e bitola, kg, das posições (comprimento em cm) × repetições. */
function massas(posicoes: readonly Posicao[], acoPadrao: Aco, repeticoes = 1): MassaAco[] {
  const m = new Map<string, MassaAco>();
  for (const p of posicoes) {
    if (!(p.quantidade > 0 && p.comprimento > 0 && p.phi > 0)) continue;
    const aco = p.aco ?? acoPadrao;
    const k = `${aco}|${p.phi}`;
    const atual = m.get(k) ?? { aco, phi: p.phi, massa: 0 };
    atual.massa += ((p.quantidade * repeticoes * p.comprimento) / 100) * massaLinear(p.phi);
    m.set(k, atual);
  }
  return [...m.values()];
}

/** Soma duas listas de massas por categoria e bitola. */
function juntar(a: readonly MassaAco[], b: readonly MassaAco[]): MassaAco[] {
  const m = new Map(a.map((x) => [`${x.aco}|${x.phi}`, { ...x }]));
  for (const x of b) {
    const atual = m.get(`${x.aco}|${x.phi}`);
    if (atual) atual.massa += x.massa;
    else m.set(`${x.aco}|${x.phi}`, { ...x });
  }
  return [...m.values()];
}

/** Posição do pilar na planta, a chave do detalhamento (DetalhamentoPilarObra.chave). */
const chavePilar = (p: { x: number; y: number }) => `${p.x.toFixed(3)};${p.y.toFixed(3)}`;

/** Repetições válidas do pavimento (o que calcularQuantitativos usa): inteiro ≥ 1, senão 0. */
const repeticoes = (n: number) => (Number.isInteger(n) && n >= 1 ? n : 0);

/** Levantamento da obra calculada (no modo dela). */
export function levantamentoDaObra(
  obra: Obra,
  r: ResultadoObra,
  det: DetalhamentoObra | null,
): LevantamentoObra {
  const modo = obra.modoCalculo ?? "corrigido";
  const acoPadrao = obra.materiais.aco;
  const elementos: ElementoQuant[] = [];
  const semAco: string[] = [];
  const avisos: string[] = [];
  const umPav = obra.pavimentos.length === 1;
  const rotulo = (pav: string, nome: string) => (umPav ? nome : `${pav}: ${nome}`);

  for (const pav of obra.pavimentos) {
    const rep = repeticoes(pav.repeticoes);
    if (rep === 0) {
      avisos.push(
        `${pav.nome}: repetições inválidas (${pav.repeticoes}); pavimento fora do orçamento.`,
      );
      continue;
    }
    const ps = r.sistrut?.pavimentos.find((p) => p.pavimentoId === pav.id);

    for (const l of pav.lajes) {
      const q = quantLaje(l, undefined);
      const d = det?.lajes.lajes.find((x) => x.pavimentoId === pav.id && x.lajeId === l.id);
      const aco = d ? massas(d.detalhamento.posicoes, acoPadrao, rep) : [];
      if (aco.length === 0) semAco.push(rotulo(pav.nome, l.nome));
      elementos.push({
        pavimentoId: pav.id,
        pavimento: pav.nome,
        tipo: "laje",
        nome: l.nome,
        concreto: q.concreto * rep,
        forma: q.forma * rep,
        aco,
      });
    }

    for (const v of pav.vigas) {
      const hLaje = espessuraLajeNaViga(v, pav.lajes);
      const quadro = ps?.vigas.find((x) => x.id === v.id)?.quadro;
      // o mesmo critério de quantPavimento: no modo original, volume e fôrma do DESINIT
      const q =
        ps && quadro && modo === "original"
          ? quantVigaDesinit(v.nome, quadro)
          : quantViga(v, hLaje, undefined, obra.materiais.cobrimentoViga);
      const d = det?.vigas.find((x) => x.pavimentoId === pav.id && x.vigaId === v.id);
      const aco = d ? massas(d.detalhamento.posicoes, acoPadrao, rep) : [];
      if (aco.length === 0) semAco.push(rotulo(pav.nome, v.nome));
      elementos.push({
        pavimentoId: pav.id,
        pavimento: pav.nome,
        tipo: "viga",
        nome: v.nome,
        concreto: q.concreto * rep,
        forma: q.forma * rep,
        aco,
      });
    }

    for (const p of pav.pilares) {
      const q = quantPilar(
        p,
        pav.peDireito,
        undefined,
        obra.materiais.cobrimentoPilar,
        encontroNoPilar(p, pav),
      );
      // aço: os lances deste pilar neste pavimento (um por repetição)
      let aco: MassaAco[] = [];
      for (const dp of det?.pilares.pilares ?? []) {
        if (dp.chave !== chavePilar(p)) continue;
        const doPav = dp.detalhamento.posicoes.filter(
          (x) => dp.lances[x.tramo]?.pavimentoId === pav.id,
        );
        aco = juntar(aco, massas(doPav, acoPadrao));
      }
      if (aco.length === 0) semAco.push(rotulo(pav.nome, p.nome));
      elementos.push({
        pavimentoId: pav.id,
        pavimento: pav.nome,
        tipo: "pilar",
        nome: p.nome,
        concreto: q.concreto * rep,
        forma: q.forma * rep,
        aco,
      });
    }
  }

  const pavimentos = obra.pavimentos
    .filter((p) => repeticoes(p.repeticoes) > 0)
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      repeticoes: p.repeticoes,
      area: p.lajes.reduce((a, l) => a + l.lx * l.ly, 0),
    }));

  // fundação: só as colunas que nascem na fundação (nível 0); a carga de uma coluna que
  // nasce sobre viga chega à fundação pelas colunas que recebem a viga
  let cargaFundacao: number | null = null;
  const s = r.sistrut;
  if (s && s.fundacoes.length > 0) {
    cargaFundacao = 0;
    const base = obra.pavimentos.at(-1);
    for (const f of s.fundacoes) {
      // a coluna nasce na fundação: lance mais baixo no nível 0; sem lance calculado, o
      // pilar da base dela está no pavimento de baixo (a obra lista do topo para a base)
      const niveis = s.lances.filter((l) => l.coluna === f.coluna).map((l) => l.nivel);
      const naFundacao =
        niveis.length > 0
          ? Math.min(...niveis) === 0
          : (base?.pilares.some((p) => p.id === f.pilarId) ?? false);
      if (!naFundacao) continue;
      cargaFundacao += f.fundacao;
      const pilar = obra.pavimentos.flatMap((p) => p.pilares).find((p) => p.id === f.pilarId);
      elementos.push({
        pavimentoId: ID_FUNDACAO,
        pavimento: PAVIMENTO_FUNDACAO,
        tipo: "fundacao",
        nome: pilar?.nome ?? f.coluna,
        concreto: 0,
        forma: 0,
        aco: [],
        carga: f.fundacao,
      });
    }
    pavimentos.push({ id: ID_FUNDACAO, nome: PAVIMENTO_FUNDACAO, repeticoes: 1, area: 0 });
  }

  return { fck: obra.materiais.fck, pavimentos, elementos, cargaFundacao, semAco, avisos };
}

/** Levantamento da obra recalculada no outro modo (NB-1/78); null se o cálculo falhar. */
export function levantamentoNoModo(obra: Obra, modo: ModoCalculo): LevantamentoObra | null {
  const outra = { ...obra, modoCalculo: modo };
  const c = calcular(outra);
  if (c.tipo !== "ok") return null;
  return levantamentoDaObra(outra, c.resultado, detalharObra(c.resultado, outra));
}
