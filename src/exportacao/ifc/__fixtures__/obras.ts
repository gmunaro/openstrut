// Obras dos testes do IFC: um prédio de 3 pavimentos desenhado pela NBR 6118 (o tipo
// repetido 2 vezes) e a obra E2E do oráculo do SISTRUT importada pela tela.
import { lajeNova, obraNova, pavimentoNovo } from "../../../dominio/criar";
import { geometriaDasVigas } from "../../../calculo/montagem";
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

/** O prédio de 3 pavimentos com uma escada avulsa (como a importação do SISTRUT a cria):
 *  E1, biapoiada de 3 m com 30 kN a 1 m do apoio 0, logo R0 = 20 kN e R1 = 10 kN pela
 *  estática. As reações estão lançadas como concentradas na primeira viga do Térreo
 *  (20 kN, a 1 m do início) e do Tipo (10 kN, a 3,5 m): o lance avança 2,5 m na planta.
 *  Devolve também esses dois pontos da planta. */
export function obraComEscada() {
  const obra = obraTresPavimentos();
  const [cobertura, tipo, terreo] = obra.pavimentos as [Pavimento, Pavimento, Pavimento];
  const recebe = (p: Pavimento, total: number, posicao: number) => {
    const v = p.vigas[0]!;
    p.vigas[0] = { ...v, cargas: [{ tipo: "concentrada", trecho: 0, posicao, total }] };
    const g = geometriaDasVigas(p).vigas.find((x) => x.viga.id === v.id)!;
    const s = g.nos[0]! + posicao;
    return g.eixo.horizontal ? { x: s, y: g.eixo.c } : { x: g.eixo.c, y: s };
  };
  const apoio0 = recebe(terreo, 20, 1);
  const apoio1 = recebe(tipo, 10, 3.5);
  const escada: Pavimento = {
    ...pavimentoNovo("ESCADA", 3, 1),
    vigas: [
      {
        id: "E1",
        nome: "E1",
        x1: 0,
        y1: -10,
        x2: 3,
        y2: -10,
        bw: 15,
        h: 40,
        cargaLinear: 0,
        vaos: [3],
        apoiosDesconsiderados: [0, 1],
        cargas: [{ tipo: "concentrada", trecho: 0, posicao: 1, total: 30 }],
      },
    ],
  };
  obra.pavimentos = [escada, cobertura, tipo, terreo];
  return { obra, escada, apoio0, apoio1 };
}
