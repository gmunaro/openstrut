// Verificações de seção (PILAR opção 6) e predimensionamento na tabela de pilares.
// Fixtures mínimas: só os campos que as subseções leem.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResultadoObra } from "../../calculo/fluxo";
import {
  motivoNaoDimensionado,
  PredimensionamentosPilares,
  TabelaPilares,
  VerificacoesPilares,
} from "./pilares";

const pilarVerificado = {
  pavimento: "Pavimento 1",
  pavimentoId: "pav-1",
  pilar: { id: "p3", nome: "P3" },
  verificacoes: [
    {
      indice: 0,
      esforcosDoLance: true,
      nk: 300,
      lambdaX: 12,
      lambdaY: 14,
      casos: [
        {
          rotulo: "1/2",
          mx: 10,
          my: 5,
          mTotal: 11,
          mrX: 20,
          mrY: 9,
          mrTotal: 22,
          veredito: "",
          erro: "nao-converge",
        },
        {
          rotulo: "2/2",
          mx: 10,
          my: 5,
          mTotal: 11,
          mrX: 20,
          mrY: 9,
          mrTotal: 22,
          veredito: "atende",
        },
      ],
      avisos: ["PILAR opção 6: barras dadas na obra."],
    },
  ],
  predimensionamento: {
    modo: "tensoes",
    lado: 30,
    tensoes: { normal: 4.5, normalAdmissivel: 7, flexao: 1.2, flexaoAdmissivel: 3 },
    carga: 250,
    avisos: ["PILAREDI: seção ajustada à tensão admissível."],
  },
};

const pilarSemNada = {
  pavimento: "Pavimento 1",
  pavimentoId: "pav-1",
  pilar: { id: "p1", nome: "P1" },
};

function resultadoCom(pilares: unknown[]) {
  return { pilares, pavimentos: [] } as unknown as ResultadoObra;
}

describe("VerificacoesPilares", () => {
  it("mostra cada caso, traduz o erro do motor e lista os avisos da verificação", () => {
    render(<VerificacoesPilares resultado={resultadoCom([pilarVerificado])} />);
    expect(screen.getByText("Verificações de seção")).toBeTruthy();
    expect(screen.getByText(/a busca do equilíbrio não converge; o original fica em laço/)).toBeTruthy();
    expect(screen.getByText("atende")).toBeTruthy();
    expect(screen.getByText("PILAR opção 6: barras dadas na obra.")).toBeTruthy();
    expect(screen.getAllByText("P3 · Pavimento 1")).toHaveLength(2);
  });

  it("não renderiza sem verificações na obra", () => {
    const { container } = render(<VerificacoesPilares resultado={resultadoCom([pilarSemNada])} />);
    expect(container.innerHTML).toBe("");
  });

  it("mostra a situação quando a verificação não tem casos", () => {
    const semCasos = {
      ...pilarVerificado,
      verificacoes: [
        {
          indice: 0,
          esforcosDoLance: false,
          nk: 300,
          casos: [],
          avisos: [],
          situacao: "Lance sem barras dadas.",
        },
      ],
    };
    render(<VerificacoesPilares resultado={resultadoCom([semCasos])} />);
    expect(screen.getByText("Lance sem barras dadas.")).toBeTruthy();
  });
});

describe("PredimensionamentosPilares", () => {
  it("mostra a opção, o lado, a carga e os avisos do predimensionamento", () => {
    render(<PredimensionamentosPilares resultado={resultadoCom([pilarVerificado])} />);
    expect(screen.getByText("Predimensionamento")).toBeTruthy();
    expect(screen.getByText("tensões")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("PILAREDI: seção ajustada à tensão admissível.")).toBeTruthy();
  });

  it("não renderiza sem predimensionamento na obra", () => {
    const { container } = render(
      <PredimensionamentosPilares resultado={resultadoCom([pilarSemNada])} />,
    );
    expect(container.innerHTML).toBe("");
  });
});

/** Pilar sem barras (n = 0), como P2/P5 quando o motor recusa a seção. */
const pilarNaoDimensionado = {
  pavimento: "Pavimento 1",
  pavimentoId: "pav-1",
  repeticao: 1,
  pilar: { id: "p2", nome: "P2", b: 20, h: 30 },
  nk: 500,
  resultado: {
    nd: 700,
    lambdaX: 0,
    lambdaY: 0,
    mdX: 0,
    mdY: 0,
    asNecessaria: 0,
    taxa: 0,
    barras: { n: 0, phi: 0, area: 0 },
    estribo: { phi: 0, espacamento: 0 },
    avisos: [
      "P2: PILAREDI recusa o pilar (NAOSUPORTA).",
      "A seção não suporta os esforços com a taxa máxima de armadura configurada.",
    ],
    memoria: [],
  },
};

const pilarDimensionado = {
  ...pilarNaoDimensionado,
  pilar: { id: "p1", nome: "P1", b: 20, h: 30 },
  resultado: {
    nd: 700,
    lambdaX: 12.3,
    lambdaY: 14.1,
    mdX: 3,
    mdY: 2,
    asNecessaria: 4.5,
    taxa: 0.8,
    barras: { n: 4, phi: 12.5, area: 5 },
    estribo: { phi: 5, espacamento: 15 },
    avisos: [],
    memoria: [],
  },
};

describe("motivoNaoDimensionado", () => {
  it("é nulo quando há barras e traz o motivo da recusa sem o nome do pilar", () => {
    expect(motivoNaoDimensionado(pilarDimensionado.resultado as never)).toBeNull();
    expect(motivoNaoDimensionado(pilarNaoDimensionado.resultado as never)).toBe(
      "PILAREDI recusa o pilar (NAOSUPORTA)",
    );
  });

  it("cai no texto genérico quando o motor não deu recusa", () => {
    const semAviso = { ...pilarNaoDimensionado.resultado, avisos: [] };
    expect(motivoNaoDimensionado(semAviso as never)).toBe("sem resultado do motor");
  });
});

describe("TabelaPilares", () => {
  const resultado = {
    pilares: [pilarDimensionado, pilarNaoDimensionado],
    pavimentos: [{ pavimento: { id: "pav-1", nome: "Pavimento 1", peDireito: 3, repeticoes: 1 } }],
  } as unknown as ResultadoObra;

  it("mostra traço nas colunas de cálculo do pilar sem barras, com o motivo na coluna Barras", () => {
    render(<TabelaPilares resultado={resultado} comMemoria={false} />);
    expect(screen.getByText("não dimensionado: PILAREDI recusa o pilar (NAOSUPORTA)")).toBeTruthy();
    // λx, λy, Mdx, Mdy, As nec., As ef., Taxa e Estribo do P2 viram "—" (8 traços).
    expect(screen.getAllByText("—")).toHaveLength(8);
    expect(screen.queryByText(/φ0/)).toBeNull();
    expect(screen.queryByText(/c\/0/)).toBeNull();
  });

  it("mantém os valores do pilar dimensionado", () => {
    render(<TabelaPilares resultado={resultado} comMemoria={false} />);
    expect(screen.getByText("4 φ12,5")).toBeTruthy();
    expect(screen.getByText("12,3")).toBeTruthy();
    expect(screen.queryAllByText(/não dimensionado/)).toHaveLength(1);
  });
});
