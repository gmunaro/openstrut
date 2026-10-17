// Obra-exemplo da tela inicial: um sobrado pequeno pronto para calcular, para quem abre o
// app pela primeira vez ver planta, resultados e relatório sem desenhar nada.
// A planta é montada com as mesmas funções do editor (lajeNova + gerarEstrutura).
import { lajeNova, obraNova, pavimentoNovo, type Retangulo } from "./criar";
import { gerarEstrutura } from "./gerar";
import type { NormaId, Obra, Pavimento } from "./obra";

export const NOME_EXEMPLO = "Sobrado exemplo";

/** Lajes da planta, m: quatro ambientes de 4,0 × 4,5 m e uma faixa de 2,5 m à direita. */
const LAJES: Retangulo[] = [
  { x: 0, y: 0, lx: 4, ly: 4.5 },
  { x: 4, y: 0, lx: 4, ly: 4.5 },
  { x: 0, y: 4.5, lx: 4, ly: 4.5 },
  { x: 4, y: 4.5, lx: 4, ly: 4.5 },
  { x: 8, y: 0, lx: 2.5, ly: 4.5 },
];

/** Espessura das lajes e lado dos pilares do exemplo, cm. */
const H_LAJE = 12;
const LADO_PILAR = 25;

/** Pavimento com as lajes de LAJES (sobrecarga em kN/m²), a estrutura gerada e os
 *  pilares com LADO_PILAR. */
function planta(nome: string, sobrecarga: number): Pavimento {
  const pav = pavimentoNovo(nome, 2.8);
  // lajeNova nomeia pelas lajes que já estão no pavimento: uma de cada vez
  for (const r of LAJES) pav.lajes.push(lajeNova(pav, r, { h: H_LAJE, sobrecarga }));
  const gerado = gerarEstrutura(pav);
  return {
    ...gerado,
    pilares: gerado.pilares.map((p) => ({ ...p, b: LADO_PILAR, h: LADO_PILAR })),
  };
}

/**
 * Obra-exemplo: cobertura (sobrecarga 0,5 kN/m², laje sem acesso) sobre o piso superior
 * (1,5 kN/m², dormitórios e salas). Pé-direito de 2,8 m. Os materiais são os padrões
 * da norma (materiaisPadrao).
 */
export function obraExemplo(norma: NormaId = "nbr6118-2023"): Obra {
  return {
    ...obraNova(NOME_EXEMPLO, norma),
    pavimentos: [planta("Cobertura", 0.5), planta("Piso superior", 1.5)],
  };
}
