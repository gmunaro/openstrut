// Desenhos do detalhamento: cotas dos vãos e nomes dos apoios no esquema da viga; corte
// do pilar com as barras do arranjo e as cotas b e h.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PosicaoArmadura } from "../../calculo/detalhamento/vigas";
import type { PosicaoPilar } from "../../calculo/detalhamento/pilares";
import type { DetalhamentoPilarObra, DetalhamentoVigaObra } from "../detalhamento";
import { barrasDoCorte, CortesPilar, EsquemaViga, vaosDosNos } from "./desenhos";

const posicao = (p: Partial<PosicaoArmadura>): PosicaoArmadura => ({
  numero: 1,
  nome: "N1",
  tipo: "positiva",
  tramo: 0,
  phi: 10,
  quantidade: 2,
  aco: "CA-50",
  comprimento: 830,
  reto: 810,
  ganchoInicio: 10,
  ganchoFim: 10,
  xInicio: -5,
  xFim: 805,
  espacamento: null,
  ...p,
});

/** Viga de dois vãos de 400 cm entre eixos, sobre P1, P2 e P3 de 20 cm. */
const viga: DetalhamentoVigaObra = {
  pavimentoId: "pav",
  pavimento: "Tipo",
  repeticoes: 1,
  vigaId: "v1",
  nome: "V1",
  bw: 12,
  h: 40,
  cobrimento: 2.5,
  nos: [0, 400, 800],
  larguraApoios: [20, 20, 20],
  nomesApoios: ["P1", "P2", "P3"],
  detalhamento: {
    nome: "V1",
    memoria: [],
    avisos: [],
    posicoes: [
      posicao({}),
      posicao({ numero: 2, nome: "N2", tipo: "estribo", phi: 5, quantidade: 50, espacamento: 15 }),
    ],
  },
};

describe("EsquemaViga", () => {
  it("cota os vãos entre eixos, em cm, e nomeia os apoios", () => {
    render(<EsquemaViga d={viga} />);
    const svg = screen.getByRole("img", { name: "Esquema das barras de V1, cotas em cm" });
    expect(within(svg).getAllByText("400")).toHaveLength(2);
    for (const p of ["P1", "P2", "P3"]) expect(within(svg).getByText(p)).toBeTruthy();
    expect(within(svg).getByText("N1 2φ10 c=830")).toBeTruthy();
    // tamanho de leitura fixo: no celular o contêiner rola de lado
    expect(svg.getAttribute("width")).toBe("760");
    expect(svg.parentElement?.className).toContain("overflow-x-auto");
  });

  it("ponta em balanço fica sem nome", () => {
    render(<EsquemaViga d={{ ...viga, nomesApoios: ["P1", "P2", ""] }} />);
    expect(screen.queryByText("P3")).toBeNull();
  });

  it("vaosDosNos dá a diferença entre nós seguidos", () => {
    expect(vaosDosNos([0, 350, 800])).toEqual([350, 450]);
  });
});

const posPilar = (p: Partial<PosicaoPilar>): PosicaoPilar => ({
  ...posicao({}),
  tipo: "longitudinal",
  ...p,
});

/** Pilar 20 × 40 com 6 φ 12,5 (2 por face de 20 cm e 3 por face de 40 cm) em dois
 *  lances iguais e um terceiro com outra bitola. */
const pilar = (): DetalhamentoPilarObra => {
  const lance = {
    nivel: "Tipo",
    nome: "P1",
    pavimentoId: "p",
    repeticao: 1,
    peDireito: 280,
    b: 20,
    h: 40,
    porFaceX: 3,
    porFaceY: 2,
    arranjo: "resultado" as const,
    traspasse: null,
    retangular: true,
  };
  const pos: PosicaoPilar[] = [0, 1, 2].flatMap((t) => [
    posPilar({
      numero: 2 * t + 1,
      nome: `N${2 * t + 1}`,
      tramo: t,
      phi: t === 2 ? 10 : 12.5,
      quantidade: 6,
    }),
    posPilar({
      numero: 2 * t + 2,
      nome: `N${2 * t + 2}`,
      tramo: t,
      tipo: "estribo",
      phi: 5,
      espacamento: 15,
    }),
  ]);
  return {
    chave: "0;0",
    nome: "P1",
    cobrimento: 2.5,
    lances: [lance, lance, lance],
    detalhamento: { nome: "P1", memoria: [], avisos: [], posicoes: pos },
  };
};

describe("CortesPilar", () => {
  it("junta lances iguais seguidos e desenha as barras do arranjo com as cotas", () => {
    render(<CortesPilar d={pilar()} />);
    const corte = screen.getByRole("img", {
      name: /Corte de P1, Lances 1 a 2: 20 × 40 cm, 6 barras/,
    });
    expect(corte.querySelectorAll("circle")).toHaveLength(6);
    expect(within(corte).getByText("20")).toBeTruthy();
    expect(within(corte).getByText("40")).toBeTruthy();
    expect(screen.getByText(/N1 6 φ 12,5 · N2 φ 5 c\/15/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /Corte de P1, Lance 3:/ })).toBeTruthy();
  });

  it("seção não retangular fica sem desenho", () => {
    const d = pilar();
    d.lances = d.lances.map((l) => ({ ...l, retangular: false }));
    const { container } = render(<CortesPilar d={d} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("barrasDoCorte conta os cantos uma vez", () => {
    expect(barrasDoCorte(20, 40, 3, 2, 4)).toHaveLength(6);
    expect(barrasDoCorte(30, 30, 2, 2, 4)).toHaveLength(4);
    const b = barrasDoCorte(20, 40, 3, 2, 4);
    expect(b).toContainEqual({ x: 4, y: 20 });
    expect(b).toContainEqual({ x: 16, y: 20 });
  });
});
