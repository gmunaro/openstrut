// Normas disponíveis. Cada uma implementa a interface Norma (tipos.ts).
import type { NormaId } from "../../dominio/obra";
import type { ComMemoria, Etapa, MateriaisCalc, Norma } from "../tipos";
import { lajeArmaduraNb178, lajeEsforcosNb178, compatibilizaNegativoNb178 } from "./nb1-78/lajes";
import { GAMA_F, materiaisNb178 } from "./nb1-78/materiais";
import { pilarNb178 } from "./nb1-78/pilares";
import { vigaCortanteNb178, vigaFlexaoNb178 } from "./nb1-78/vigas";
import {
  compatibilizaNegativo6118,
  lajeArmadura6118,
  lajeEsforcos6118,
} from "./nbr6118-2023/lajes";
import { avisosMateriais6118, GAMA_G, GAMA_Q, materiais6118 } from "./nbr6118-2023/materiais";
import { pilar6118 } from "./nbr6118-2023/pilares";
import { vigaCortante6118, vigaFlexao6118 } from "./nbr6118-2023/vigas";

/** A mesma resposta com `etapa` no começo da memória. */
const comEtapa = <T extends ComMemoria>(r: T, etapa: Etapa): T => ({
  ...r,
  memoria: [etapa, ...r.memoria],
});

/** Classe do aço que a NB-1/78 usa (ausente = A). O CA-25 é sempre classe A (aço
 *  laminado a quente; a classe B é a do aço encruado a frio): CA-25 com B é
 *  calculado como A, com aviso (avisoClasse). */
const classeNb178 = (mat: MateriaisCalc) => (mat.aco === "CA-25" ? "A" : (mat.classeAco ?? "A"));
const avisoClasse = (mat: MateriaisCalc) =>
  mat.aco === "CA-25" && mat.classeAco === "B"
    ? [
        "Aço CA-25 é sempre classe A; a classe B informada foi ignorada e o cálculo usou a classe A.",
      ]
    : [];
const etapaClasse = (mat: MateriaisCalc): Etapa => ({
  descricao: `Aço ${mat.aco} classe ${classeNb178(mat)}`,
  formula:
    classeNb178(mat) === "B"
      ? "diagrama curvo acima de 0,7 fyd; εyd = fyd/Es + 2‰"
      : "diagrama com patamar; εyd = fyd/Es",
  ref: "V1 CcaAcoClasse%",
});
/** A resposta com a etapa da classe do aço na memória e o aviso de CA-25 com B. */
const comClasse = <T extends ComMemoria>(r: T, mat: MateriaisCalc): T => ({
  ...comEtapa(r, etapaClasse(mat)),
  avisos: [...r.avisos, ...avisoClasse(mat)],
});

/** Faixa usual da relação de ortotropia μ = my/mx nas lajes calculadas por
 *  charneiras plásticas (Johansen). [VERIFICAR] a fonte: a literatura cita
 *  0,5 ≤ μ ≤ 2 ou 1/3 ≤ μ ≤ 3 conforme o autor (Langendonck, Charneiras plásticas,
 *  ABCP 1966, não conferido); adotada a mais restrita. Fora dela, calcula com aviso. */
export const MU_USUAL = { min: 0.5, max: 2 };
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const avisoMu = (nome: string, mu: number) =>
  mu < MU_USUAL.min || mu > MU_USUAL.max
    ? [
        `Laje ${nome}: μ = ${fmt(mu)} fora da faixa usual ${fmt(MU_USUAL.min)} ≤ μ ≤ ` +
          `${fmt(MU_USUAL.max)} das charneiras plásticas; calculada assim mesmo, confira a ortotropia.`,
      ]
    : [];

export const nb178: Norma = {
  id: "nb1-78",
  nome: "NB-1/78 (NBR 6118:1978)",
  caminho: "sistrut",
  gamaG: GAMA_F,
  gamaQ: GAMA_F,
  pesoConcreto: 25,
  ligacaoVigaPilar: false,
  recalculaBordoAliviado: false,
  materiais: (m) => ({ ...materiaisNb178(m), classeAco: m.classeAco }),
  lajeEsforcos: (e, mat) => {
    const mu = e.mu ?? 1;
    const r = comEtapa(lajeEsforcosNb178(e, mat, mu), {
      descricao: "Relação de ortotropia μ = my/mx (só nas lajes armadas em cruz)",
      formula: mu === 1 ? "μ = 1: isótropa" : "laje afim de Johansen: lyr/√μ; my = μ·mx",
      valor: mu,
      ref: "V1 LcMu#",
    });
    return { ...r, avisos: [...r.avisos, ...avisoMu(e.nome, mu)] };
  },
  compatibilizaNegativo: compatibilizaNegativoNb178,
  lajeArmadura: (e, esf, mat, cobrimento) =>
    comClasse(lajeArmaduraNb178(e, esf, mat, cobrimento, classeNb178(mat)), mat),
  vigaFlexao: (md, bw, h, d, mat) =>
    comClasse(vigaFlexaoNb178(md, bw, h, d, mat, classeNb178(mat)), mat),
  vigaCortante: vigaCortanteNb178,
  pilar: (e, mat, dLinha) => comClasse(pilarNb178(e, mat, dLinha, classeNb178(mat)), mat),
};

/** A NBR 6118:2023 não tem aço classe B e calcula a laje elástica (tabelas):
 *  ignora `classeAco` e `mu`. */
export const nbr6118: Norma = {
  id: "nbr6118-2023",
  nome: "NBR 6118:2023",
  caminho: "v2",
  gamaG: GAMA_G,
  gamaQ: GAMA_Q,
  pesoConcreto: 25,
  ligacaoVigaPilar: true,
  recalculaBordoAliviado: true,
  materiais: materiais6118,
  avisosMateriais: avisosMateriais6118,
  lajeEsforcos: lajeEsforcos6118,
  compatibilizaNegativo: compatibilizaNegativo6118,
  lajeArmadura: lajeArmadura6118,
  vigaFlexao: vigaFlexao6118,
  vigaCortante: vigaCortante6118,
  pilar: pilar6118,
};

const NORMAS: Partial<Record<NormaId, Norma>> = { "nb1-78": nb178, "nbr6118-2023": nbr6118 };

/** A implementação da norma, ou undefined se ainda não existe. */
export const normaPorId = (id: NormaId): Norma | undefined => NORMAS[id];
