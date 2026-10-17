// Obras dos testes do IFC: um prédio de 3 pavimentos desenhado pela NBR 6118 (o tipo
// repetido 2 vezes) e a obra E2E do oráculo do SISTRUT importada pela tela.
import { lajeNova, obraNova, pavimentoNovo } from "../../../dominio/criar";
import { gerarEstrutura } from "../../../dominio/gerar";
import type { Obra, Pavimento } from "../../../dominio/obra";

/** Pavimento com duas lajes (4 × 5 e 3,5 × 5 m, h = 12 cm) e a estrutura gerada. */
function pavimento(nome: string, peDireito: number, repeticoes: number): Pavimento {
  const p = pavimentoNovo(nome, peDireito, repeticoes);
  const l1 = lajeNova(p, { x: 0, y: 0, lx: 4, ly: 5 }, { h: 12 });
  const l2 = lajeNova({ ...p, lajes: [l1] }, { x: 4, y: 0, lx: 3.5, ly: 5 }, { h: 12 });
  return gerarEstrutura({ ...p, lajes: [l1, l2] });
}

/** Cobertura (pé-direito 3,0 m), Tipo (2,8 m, 2 repetições) e Térreo (3,2 m): níveis
 *  em 3,2; 6,0; 8,8 e 11,8 m. */
export function obraTresPavimentos(): Obra {
  const obra = obraNova("Prédio IFC", "nbr6118-2023");
  return {
    ...obra,
    pavimentos: [
      pavimento("Cobertura", 3, 1),
      pavimento("Tipo", 2.8, 2),
      pavimento("Térreo", 3.2, 1),
    ],
  };
}
