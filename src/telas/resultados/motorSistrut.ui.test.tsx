// Marcas do motor SISTRUT (otimização parada, viga interrompida, caso de pilar sem
// resultado e aviso de verificação) e o estado vazio do bloco. Fixtures mínimas: só os
// campos que o bloco lê.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResultadoObra } from "../../calculo/fluxo";
import { ListaAvisos } from "./avisos";
import { BlocoMotorSistrut, coletarMarcasMotor, semMarcasDuplicadas } from "./motorSistrut";

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
    expect(textos).toContain("a otimização dos negativos não converge: no lado 2");
    expect(textos).toContain("passa a 1,50");
    expect(textos).toContain('"Continuo com o processamento desta Viga S/N"');
    expect(textos).toContain("tabela de apoios e tramos já impressa");
    expect(textos).toContain("Caso 1/2: a busca do equilíbrio não converge");
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

describe("coletarMarcasMotor: opção da viga interrompida", () => {
  it("leva a opção do motor (avisosComOpcao) e não cita nome de campo", () => {
    const opcao = {
      id: "viga.continuar-acima-do-limite",
      pavimentoId: "pav1",
      elemento: { tipo: "viga", id: "v1" },
      texto: "V1: …",
    };
    const r = {
      ...resultadoCom([
        { ...pavimentoComMarcas, vigas: [{ ...pavimentoComMarcas.vigas[0], id: "v1" }] },
      ]),
      avisosComOpcao: [opcao],
    } as unknown as ResultadoObra;
    const marca = coletarMarcasMotor(r).find((m) => m.elemento === "V1");
    expect(marca?.opcao).toEqual(opcao);
    expect(marca?.texto).not.toMatch(/continuaSeExcederLimite/);
  });
});

describe("semMarcasDuplicadas", () => {
  const avisos = [
    { local: "Pavimento 1", elemento: "V1", texto: "V1: o DESDIM não dimensiona (momento)." },
    { local: "Pavimento 1", elemento: "V1 (detalhamento)", texto: "V1: armadura dupla." },
    { local: "Pavimento 1", elemento: "V2", texto: "V2: aviso de outra viga." },
    { local: "Pavimento 1", elemento: "L1", texto: "L1: sem momentos." },
  ];

  it("tira só o aviso geral da viga interrompida; o de detalhamento da mesma viga fica", () => {
    const filtrados = semMarcasDuplicadas(avisos, resultadoCom([pavimentoComMarcas]));
    expect(filtrados.map((a) => a.elemento)).toEqual(["V1 (detalhamento)", "V2", "L1"]);
  });

  it("não mexe na lista quando nenhuma viga está interrompida", () => {
    const semInterrompida = resultadoCom([{ nome: "Pavimento 1", vigas: [{ nome: "V1" }] }]);
    expect(semMarcasDuplicadas(avisos, semInterrompida)).toEqual(avisos);
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

  it("afasta o bloco da caixa de cima (margem superior)", () => {
    const { container } = render(
      <BlocoMotorSistrut resultado={resultadoCom([{ nome: "P1", vigas: [] }])} />,
    );
    expect(container.querySelector("section")?.className).toContain("mt-4");
  });

  it("não renderiza sem resultado do motor", () => {
    const { container } = render(
      <BlocoMotorSistrut resultado={{ sistrut: undefined } as unknown as ResultadoObra} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
