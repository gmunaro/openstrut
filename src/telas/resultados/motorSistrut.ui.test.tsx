// Marcas do motor SISTRUT (otimização parada, viga interrompida, caso de pilar sem
// resultado e aviso de verificação) e o estado vazio do bloco. Fixtures mínimas: só os
// campos que o bloco lê.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResultadoObra } from "../../calculo/fluxo";
import { ListaAvisos } from "./avisos";
import { BlocoMotorSistrut, coletarMarcasMotor } from "./motorSistrut";

function resultadoCom(
  pavimentos: unknown[],
  pilares: unknown[] = [],
  modo: "original" | "corrigido" = "original",
) {
  return { sistrut: { modo, pavimentos }, pilares } as unknown as ResultadoObra;
}

const pavimentoComMarcas = {
  nome: "Pavimento 1",
  otimizacaoParada: { laje: "L2", lado: 1, relacaoNova: 1.5, codigo: 7, lados: [] },
  vigas: [
    {
      nome: "V1",
      avisos: [],
      interrompida: { motivos: ["momento"], impressa: true },
    },
    { nome: "V2", avisos: [] },
  ],
};

const pilarComMarcas = {
  pavimento: "Pavimento 1",
  pilar: { nome: "P3" },
  verificacoes: [
    {
      indice: 0,
      esforcosDoLance: true,
      nk: 10,
      casos: [{ rotulo: "1/2", erro: "nao-converge" }],
      avisos: ["PILAR opção 6: verificação incompleta."],
    },
  ],
};

describe("coletarMarcasMotor", () => {
  it("lista otimização parada, viga interrompida, caso sem resultado e aviso do pilar", () => {
    const marcas = coletarMarcasMotor(resultadoCom([pavimentoComMarcas], [pilarComMarcas]));
    expect(marcas).toEqual([
      expect.objectContaining({ local: "Pavimento 1", elemento: "L2" }),
      expect.objectContaining({ local: "Pavimento 1", elemento: "V1" }),
      expect.objectContaining({ local: "Pavimento 1", elemento: "P3" }),
      expect.objectContaining({ local: "Pavimento 1", elemento: "P3" }),
    ]);
    const textos = marcas.map((m) => m.texto).join("\n");
    expect(textos).toContain("lado 2");
    expect(textos).toContain("relação 1,50");
    expect(textos).toContain('"Continuo com o processamento desta Viga S/N"');
    expect(textos).toContain("tabela de apoios e tramos já impressa");
    expect(textos).toContain("caso 1/2: não converge");
    expect(textos).toContain("PILAR opção 6: verificação incompleta.");
  });

  it("vazio quando não há marca nenhuma", () => {
    expect(coletarMarcasMotor(resultadoCom([{ nome: "P1", vigas: [] }]))).toEqual([]);
  });

  it("não repete o caso que já está citado num aviso da mesma verificação", () => {
    const pilarCitado = {
      ...pilarComMarcas,
      verificacoes: [
        {
          ...pilarComMarcas.verificacoes[0],
          avisos: [
            "P1: Caso 1/2: a busca do equilíbrio não converge; o original fica em laço (D-2).",
          ],
        },
      ],
    };
    const textos = coletarMarcasMotor(resultadoCom([], [pilarCitado])).map((m) => m.texto);
    expect(textos).toEqual([
      "P1: Caso 1/2: a busca do equilíbrio não converge; o original fica em laço (D-2).",
    ]);
  });
});

describe("ListaAvisos", () => {
  it("mostra o texto de vazio dado", () => {
    render(<ListaAvisos avisos={[]} vazio="Nenhum aviso geral; as marcas estão abaixo." />);
    expect(screen.getByText("Nenhum aviso geral; as marcas estão abaixo.")).toBeTruthy();
  });
});

describe("BlocoMotorSistrut", () => {
  it("mostra o modo do motor e o estado vazio sem marcas", () => {
    render(<BlocoMotorSistrut resultado={resultadoCom([{ nome: "P1", vigas: [] }])} />);
    expect(screen.getByRole("heading", { name: /Marcas do motor SISTRUT/ }).textContent).toContain(
      "como o SISTRUT original",
    );
    expect(screen.getByText(/Nenhuma marca do motor/)).toBeTruthy();
  });

  it("lista as marcas quando há", () => {
    render(
      <BlocoMotorSistrut
        resultado={resultadoCom([pavimentoComMarcas], [pilarComMarcas], "corrigido")}
      />,
    );
    expect(screen.getByRole("heading", { name: /Marcas do motor SISTRUT/ }).textContent).toContain(
      "corrigido",
    );
    expect(screen.getByText("4 aviso(s)")).toBeTruthy();
  });

  it("não renderiza sem resultado do motor", () => {
    const { container } = render(
      <BlocoMotorSistrut resultado={{ sistrut: undefined } as unknown as ResultadoObra} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
