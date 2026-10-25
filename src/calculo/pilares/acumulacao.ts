// Carga acumulada nos pilares, do topo para a base, com peso próprio de cada lance.
// Comum às duas normas. Portado de V1 PILGECAL.BM (PgSomaPavimento, PgAcumula):
// Nk(nível) = Nk(nível de cima) + carga das vigas no nível + peso próprio do lance.
// Só a normal acumula; momentos de ligação viga-pilar são locais ao nível.
import { num } from "../texto";
import type { ComMemoria, Etapa } from "../tipos";

/** Seção do pilar, cm. */
export type SecaoPilar =
  | { forma: "retangular"; b: number; h: number }
  | { forma: "circular"; diametro: number };

export interface CargaNoPilar {
  /** Chave que casa o mesmo pilar entre pavimentos (o fluxo usa a posição). */
  pilar: string;
  /** Nome para os avisos; sem ele, a chave. */
  nome?: string;
  secao: SecaoPilar;
  /** Carga característica que o pilar recebe das vigas neste pavimento, kN. */
  carga: number;
}

export interface PavimentoCargas {
  /** Identifica o pavimento (nomes podem se repetir). */
  id: string;
  nome: string;
  /** Pé-direito (altura do lance), m. */
  peDireito: number;
  /** Quantas vezes o pavimento se repete (pavimento-tipo); 1 = único. */
  repeticoes: number;
  /** Pilares com lance neste pavimento. */
  pilares: CargaNoPilar[];
}

export interface NkPilar {
  pilar: string;
  /** Carga das vigas neste nível, kN. */
  carga: number;
  /** Peso próprio do lance, kN. */
  pesoProprio: number;
  /** Força normal característica acumulada na base do lance, kN. */
  nk: number;
}

export interface NivelAcumulado {
  pavimentoId: string;
  /** Nome do pavimento (só para exibição; case pelo id). */
  pavimento: string;
  /** 1..repeticoes do pavimento. */
  repeticao: number;
  pilares: NkPilar[];
}

/** Pilar que tem lance no nível de cima e não tem neste: a carga dele teria de
 *  ir a uma viga de transição deste pavimento, o que o cálculo não faz. */
export interface Transicao {
  pilar: string;
  nome: string;
  pavimentoId: string;
  repeticao: number;
  /** Carga que chega de cima e não foi aplicada em viga nenhuma, kN. */
  nk: number;
  /** Aviso já formatado (também em `avisos`). */
  aviso: string;
}

export interface CargasAcumuladas extends ComMemoria {
  /** Do topo para a base, um nível por repetição. */
  niveis: NivelAcumulado[];
  transicoes: Transicao[];
}

/** Área da seção, cm² (circular: π·D²/4). */
export const areaSecao = (s: SecaoPilar) =>
  s.forma === "circular" ? (Math.PI * s.diametro ** 2) / 4 : s.b * s.h;

/** Acumula Nk por pilar e por nível. `pavimentos` vai do topo para a base; cada
 *  repetição de um pavimento-tipo é um nível. `pesoEspecifico` em kN/m³ (a V1 usa
 *  2,5 tf/m³ = 25 kN/m³). Pilar que termina num pavimento intermediário (sem lance
 *  num nível inferior): a carga continua descendo pela mesma posição, sem peso
 *  próprio (como a V1), mas nenhuma viga do pavimento a recebe; vira Transicao e
 *  aviso no primeiro nível sem lance. */
export function cargaAcumulada(
  pavimentos: PavimentoCargas[],
  pesoEspecifico: number,
  /** Pilares (pela chave) cuja carga termina onde o lance deles termina, sem
   *  transição nem falha, com o aviso dado: a coluna do SISTRUT que nasce sobre
   *  viga com a carga lançada nela, e o apoio de cálculo (fluxo.ts). */
  fins: ReadonlyMap<string, string> = new Map(),
): CargasAcumuladas {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const niveis: NivelAcumulado[] = [];
  const transicoes: Transicao[] = [];
  const nomes = new Map<string, string>();
  /** Pilares cuja carga já desce sem lance (aviso dado no primeiro nível). */
  const semLance = new Set<string>();
  let acima = new Map<string, number>();

  for (const pav of pavimentos) {
    if (!Number.isInteger(pav.repeticoes) || pav.repeticoes < 1) {
      avisos.push(
        `${pav.nome}: número de repetições inválido (${pav.repeticoes}); pavimento ignorado`,
      );
      continue;
    }
    for (let r = 1; r <= pav.repeticoes; r++) {
      const nivel = pav.repeticoes > 1 ? `${pav.nome} (${r}/${pav.repeticoes})` : pav.nome;
      const doNivel = new Map<string, NkPilar>();
      for (const c of pav.pilares) {
        nomes.set(c.pilar, c.nome ?? c.pilar);
        semLance.delete(c.pilar);
        const existente = doNivel.get(c.pilar);
        if (existente) {
          existente.carga += c.carga;
          existente.nk += c.carga;
          continue;
        }
        const pesoProprio = (areaSecao(c.secao) / 10_000) * pav.peDireito * pesoEspecifico;
        const nkAcima = acima.get(c.pilar) ?? 0;
        doNivel.set(c.pilar, {
          pilar: c.pilar,
          carga: c.carga,
          pesoProprio,
          nk: nkAcima + c.carga + pesoProprio,
        });
      }
      for (const [pilar, nk] of acima) {
        if (doNivel.has(pilar)) continue;
        const fim = fins.get(pilar);
        if (fim !== undefined) {
          if (!semLance.has(pilar)) avisos.push(fim);
          semLance.add(pilar);
          continue;
        }
        if (!semLance.has(pilar)) {
          const nome = nomes.get(pilar) ?? pilar;
          const aviso = `Pilar ${nome} termina no pavimento ${nivel}: a carga (${num(nk, 2)} kN) NÃO foi transferida a viga de transição — modele a transição.`;
          avisos.push(aviso);
          transicoes.push({ pilar, nome, pavimentoId: pav.id, repeticao: r, nk, aviso });
          semLance.add(pilar);
        }
        doNivel.set(pilar, { pilar, carga: 0, pesoProprio: 0, nk });
      }
      for (const p of doNivel.values()) {
        const nkAcima = p.nk - p.carga - p.pesoProprio;
        memoria.push({
          descricao: `${nomes.get(p.pilar) ?? p.pilar} em ${nivel}`,
          formula: `Nk = Nk,acima + carga + pp = ${num(nkAcima, 2)} + ${num(p.carga, 2)} + ${num(p.pesoProprio, 2)}`,
          valor: p.nk,
          unidade: "kN",
          ref: "V1 PILGECAL.BM",
        });
      }
      niveis.push({
        pavimentoId: pav.id,
        pavimento: pav.nome,
        repeticao: r,
        pilares: [...doNivel.values()],
      });
      acima = new Map([...doNivel.values()].map((p) => [p.pilar, p.nk]));
    }
  }
  return { avisos, memoria, niveis, transicoes };
}
