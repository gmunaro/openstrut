// Ponte entre a obra aberta e o motor de cálculo para as telas: roda
// calcularObra sem deixar a tela quebrar (norma sem implementação ou erro do
// motor viram estado explícito) e junta os avisos de todos os elementos.
import {
  calcularObra,
  type ResultadoLaje,
  type ResultadoPilar,
  type ResultadoObra,
  type ResultadoViga,
} from "../calculo/fluxo";
import type { AvisoComOpcao } from "../calculo/avisos";
import { normaPorId } from "../calculo/normas";
import type { ModoCalculo, NormaId, Obra } from "../dominio/obra";
import type { DetalhamentoObra } from "./detalhamento";

export const NOME_NORMA: Record<NormaId, string> = {
  "nb1-78": "NB-1/78",
  "nbr6118-2023": "NBR 6118:2023",
};

/** Rótulos do switch do modo de cálculo (docs/MODO-CALCULO.md). */
export const NOME_MODO: Record<ModoCalculo, string> = {
  corrigido: "Corrigido",
  original: "Como o SISTRUT original",
};

/** Selo dos resultados quando a obra reproduz o SISTRUT de 1991. */
export const SELO_MODO_ORIGINAL = "Modo: como o SISTRUT original";

export type Calculo =
  | { tipo: "ok"; resultado: ResultadoObra }
  /** A norma da obra ainda não tem implementação no motor. */
  | { tipo: "semNorma"; norma: NormaId }
  | { tipo: "erro"; mensagem: string };

/** Obra sem laje, viga nem pilar em pavimento nenhum: não há o que verificar. */
export const obraSemElementos = (obra: Obra) =>
  obra.pavimentos.every((p) => p.lajes.length + p.vigas.length + p.pilares.length === 0);

/** Texto da lista de avisos vazia numa obra sem elementos (no lugar de "Nenhum aviso"). */
export const AVISOS_OBRA_VAZIA =
  "A obra ainda não tem elementos: desenhe as lajes e os pilares na aba Planta.";

/** Calcula a obra pela norma dela. Não lança: devolve o motivo quando não dá. */
export function calcular(obra: Obra): Calculo {
  const norma = normaPorId(obra.norma);
  if (!norma) return { tipo: "semNorma", norma: obra.norma };
  try {
    return { tipo: "ok", resultado: calcularObra(obra, norma) };
  } catch (e) {
    return { tipo: "erro", mensagem: e instanceof Error ? e.message : String(e) };
  }
}

export const mensagemSemNorma = (norma: NormaId) =>
  `Cálculo pela ${NOME_NORMA[norma]} ainda não disponível. Escolha a NB-1/78 nos dados da obra para calcular.`;

/** Quem emitiu o aviso: o cálculo (o motor), o detalhamento das barras da V2
 *  (telas/detalhamento.ts, regras da própria V2) ou a importação de arquivos. */
export type FonteAviso = "calculo" | "detalhamento" | "importacao";

export interface Aviso {
  /** Pavimento ou nível ("" para avisos da obra inteira). */
  local: string;
  /** Elemento ("" quando o aviso é do pavimento). */
  elemento: string;
  texto: string;
  /** O aviso tem uma opção no elemento (ResultadoObra.avisosComOpcao): a tela põe o botão. */
  opcao?: AvisoComOpcao;
  /** Origem do aviso. Ausente: a lista deduz (o elemento "Vx (detalhamento)" que
   *  `coletarAvisos` dá é do detalhamento; o resto, do cálculo). */
  fonte?: FonteAviso;
}

/** A opção de um aviso, pelo texto: o motor dá o mesmo texto na lista do elemento ou nas
 *  falhas do pavimento e em `avisosComOpcao`. */
const comOpcao = (r: ResultadoObra, a: Aviso): Aviso => {
  const opcao = r.avisosComOpcao?.find((o) => o.texto === a.texto);
  return opcao ? { ...a, opcao } : a;
};

export const avisosLaje = (r: ResultadoLaje) => [...r.esforcos.avisos, ...r.armadura.avisos];

/** Avisos da viga: os da análise contínua e os do dimensionamento (já com o tramo). */
export const avisosViga = (r: ResultadoViga) => [...new Set([...r.analise.avisos, ...r.avisos])];

/** Avisos das verificações de seção dada do pilar (NB-1/78): os da própria
 *  verificação e o `erro` de cada caso de excentricidade (onde o original trava). */
export const avisosVerificacoesPilar = (p: Pick<ResultadoPilar, "verificacoes">): string[] =>
  (p.verificacoes ?? []).flatMap((v) => [
    ...v.avisos,
    ...v.casos.flatMap((c) => (c.erro ? [c.erro] : [])),
  ]);

/** Todos os avisos da obra, na ordem: obra, pavimentos (lajes, montagem, vigas,
 *  equilíbrio), pilares por nível (cálculo e verificações) e, se houver, o
 *  detalhamento (vigas, lajes e pilares).
 *  Nenhum é filtrado. */
export function coletarAvisos(r: ResultadoObra, detalhamento?: DetalhamentoObra | null): Aviso[] {
  const avisos: Aviso[] = r.avisos.map((texto) => ({ local: "", elemento: "", texto }));
  for (const p of r.pavimentos) {
    const local = p.pavimento.nome;
    for (const l of p.lajes)
      for (const texto of avisosLaje(l)) avisos.push({ local, elemento: l.laje.nome, texto });
    for (const texto of p.montagem.avisos) avisos.push({ local, elemento: "", texto });
    for (const v of p.montagem.naoCalculadas)
      avisos.push({
        local,
        elemento: v.nome,
        texto: "viga não calculada (apoios insuficientes ou ciclo de apoios).",
      });
    for (const v of p.vigas)
      for (const texto of avisosViga(v)) avisos.push({ local, elemento: v.viga.nome, texto });
    for (const texto of p.equilibrio.avisos) avisos.push({ local, elemento: "equilíbrio", texto });
  }
  for (const p of r.pilares)
    for (const texto of [...p.resultado.avisos, ...avisosVerificacoesPilar(p)])
      avisos.push({ local: rotuloNivel(r, p), elemento: p.pilar.nome, texto });
  for (const v of detalhamento?.vigas ?? [])
    for (const texto of v.detalhamento.avisos)
      avisos.push({ local: v.pavimento, elemento: `${v.nome} (detalhamento)`, texto });
  for (const l of detalhamento?.lajes.lajes ?? [])
    for (const texto of l.detalhamento.avisos)
      avisos.push({ local: l.pavimento, elemento: `${l.nome} (detalhamento)`, texto });
  for (const p of detalhamento?.pilares.pilares ?? []) {
    const local = [p.lances[0]?.nivel, p.lances.at(-1)?.nivel];
    for (const texto of p.detalhamento.avisos)
      avisos.push({
        local: local[0] === local[1] ? (local[0] ?? "") : local.join(" a "),
        elemento: `${p.nome} (detalhamento)`,
        texto,
      });
  }
  return avisos.map((a) => comOpcao(r, a));
}

/** Falhas dos pavimentos (ResultadoPavimento.falhas): carga que não chegou às vigas
 *  ou aos pilares, deixando vigas e pilares daqui para baixo incompletos. Elas
 *  também estão nos avisos do equilíbrio; aqui vão à parte para o destaque. */
export const coletarFalhas = (r: ResultadoObra): Aviso[] =>
  r.pavimentos.flatMap((p) =>
    p.falhas.map((texto) => comOpcao(r, { local: p.pavimento.nome, elemento: "", texto })),
  );

/** Nome do nível de um pilar: o pavimento e, se ele se repete, "(k/n)". O
 *  pavimento é casado pelo id (nomes podem se repetir). */
export function rotuloNivel(
  r: ResultadoObra,
  p: Pick<ResultadoPilar, "pavimentoId" | "pavimento" | "repeticao">,
) {
  const n = r.pavimentos.find((rp) => rp.pavimento.id === p.pavimentoId)?.pavimento.repeticoes ?? 1;
  return n > 1 ? `${p.pavimento} (${p.repeticao}/${n})` : p.pavimento;
}

/** Frase obrigatória na tela e no relatório (CLAUDE.md, inegociáveis). */
export const AVISO_CONFERENCIA = "Os resultados exigem conferência de engenheiro responsável.";
