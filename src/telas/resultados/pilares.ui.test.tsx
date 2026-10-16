// Verificações de seção (PILAR opção 6) e predimensionamento na tabela de pilares.
// Fixtures mínimas: só os campos que as subseções leem.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResultadoObra } from "../../calculo/fluxo";
import { PredimensionamentosPilares, VerificacoesPilares } from "./pilares";

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
    expect(screen.getByText(/não converge; o original trava/)).toBeTruthy();
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
