// Criação de obra, pavimento e laje com valores iniciais e nomes automáticos.
// Os nomes seguem a V1: lajes "L<n>" com o menor n livre (LAJEGEOM.BAS,
// LajNomeLivre$); vigas e pilares são numerados por gerarEstrutura (gerar.ts).
import type { Laje, Materiais, NormaId, Obra, Pavimento } from "./obra";

/** Id estável de elemento (não muda com renomear ou renumerar). */
export const novoId = () => crypto.randomUUID();

/** Primeiro "<prefixo><n>" (n = 1, 2, ...) que nenhum dos nomes usa. */
export function nomeLivre(prefixo: string, usados: readonly string[]) {
  const ocupados = new Set(usados);
  let n = 1;
  while (ocupados.has(`${prefixo}${n}`)) n++;
  return `${prefixo}${n}`;
}

/** Materiais iniciais de uma obra nova; o usuário ajusta depois.
 *  NB-1/78: fck 15 MPa e CA-50 como os exemplos da V1 (T_FLUXO.BAS: fck 0,15 tf/cm², fyk 5 tf/cm²).
 *  NBR 6118:2023: C25, CAA II e cobrimentos nominais da tabela 7.2 (laje 2,5 cm; viga e pilar 3,0 cm). */
export function materiaisPadrao(norma: NormaId): Materiais {
  if (norma === "nb1-78") {
    return {
      fck: 15,
      aco: "CA-50",
      acoEstribo: "CA-50",
      classeAco: "A",
      caa: 1,
      cobrimentoLaje: 1.5,
      cobrimentoViga: 2.5,
      cobrimentoPilar: 2.5,
    };
  }
  return {
    fck: 25,
    aco: "CA-50",
    acoEstribo: "CA-60",
    classeAco: "A",
    caa: 2,
    cobrimentoLaje: 2.5,
    cobrimentoViga: 3,
    cobrimentoPilar: 3,
  };
}

/** Pavimento vazio. Pé-direito em m. */
export function pavimentoNovo(nome: string, peDireito = 3, repeticoes = 1): Pavimento {
  return {
    id: novoId(),
    nome,
    peDireito,
    repeticoes,
    lajes: [],
    vigas: [],
    pilares: [],
    pilaresRemovidos: [],
  };
}

/** Obra nova com um pavimento vazio. */
export function obraNova(nome: string, norma: NormaId): Obra {
  return {
    versao: 3,
    nome,
    norma,
    materiais: materiaisPadrao(norma),
    pavimentos: [pavimentoNovo("Pavimento 1")],
  };
}

export interface Retangulo {
  x: number;
  y: number;
  lx: number;
  ly: number;
}

/** Laje nova no retângulo dado (m), com o próximo nome "L<n>" livre do pavimento.
 *  Valores iniciais: h = 10 cm, revestimento 1,0 kN/m² e sobrecarga 1,5 kN/m²
 *  (a laje da obra FLUXO da V1: h 10 cm, g 0,10 tf/m², q 0,15 tf/m²) e μ = 1 (isótropa).
 *  Não altera o pavimento: quem chama acrescenta a laje e roda gerarEstrutura. */
export function lajeNova(
  pavimento: Pavimento,
  r: Retangulo,
  opcoes: Partial<Pick<Laje, "h" | "revestimento" | "sobrecarga" | "vinculos" | "mu">> = {},
): Laje {
  return {
    id: novoId(),
    nome: nomeLivre(
      "L",
      pavimento.lajes.map((l) => l.nome),
    ),
    x: r.x,
    y: r.y,
    lx: r.lx,
    ly: r.ly,
    h: 10,
    revestimento: 1,
    sobrecarga: 1.5,
    vinculos: {},
    mu: 1,
    ...opcoes,
  };
}
