// Lista de avisos organizada: severidade com contagem, grupos com resumo dos repetidos,
// informativos recolhidos, selo de origem por modo, tudo aberto no relatório e a mesma
// organização na lista da importação. Textos sintéticos, no formato dos emissores.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Aviso } from "../calculo";
import { ListaAvisos, ListaAvisosImportacao } from "./avisos";

const premoldada = (local: string, l: string): Aviso => ({
  local,
  elemento: l,
  texto: `${l}: pré-moldada; o LAJECALC não calcula momentos, só a montagem a carrega.`,
});
const ancoragem = (local: string, v: string, k: number): Aviso => ({
  local,
  elemento: `${v} (detalhamento)`,
  texto: `${v} N1: ancoragem no apoio ${k} insuficiente (lb,ef = 10,0 cm < 20,0 cm); use grampos ou aumente o apoio.`,
});
const naoConcluido: Aviso = {
  local: "ALTO",
  elemento: "V9",
  texto:
    "V9: dimensionamento/detalhamento não concluído: Espaçamento de estribo 7 cm fora da lista do .DSP (erro 5 do QuickBASIC)",
};

const AVISOS: Aviso[] = [
  premoldada("ALTO", "L1"),
  premoldada("ALTO", "L2"),
  naoConcluido,
  ancoragem("ALTO", "V1", 1),
  ancoragem("ALTO", "V1", 2),
  ancoragem("ALTO", "V2", 1),
  ancoragem("BAIXO", "V3", 2),
  premoldada("BAIXO", "L3"),
];

describe("ListaAvisos organizada", () => {
  it("conta o total e cada severidade, e mantém todos os textos", () => {
    render(<ListaAvisos avisos={AVISOS} />);
    expect(screen.getByText("8 aviso(s)")).toBeTruthy();
    expect(screen.getByText("1 erro, 4 de atenção, 3 informativos")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Erros que impedem o cálculo (1)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Atenção de engenharia (4)" })).toBeTruthy();
    for (const a of AVISOS) expect(screen.getAllByText(a.texto).length).toBe(1);
  });

  it("junta os repetidos num grupo com contagem e o resumo de onde aparecem", () => {
    render(<ListaAvisos avisos={AVISOS} />);
    const grupo = screen.getByText("Ancoragem insuficiente").closest("li")!;
    expect(within(grupo).getByText("(4)")).toBeTruthy();
    expect(
      within(grupo).getByText("ALTO V1 (apoios 1 e 2), V2 (apoio 1); BAIXO V3 (apoio 2)"),
    ).toBeTruthy();
  });

  it("informativos começam recolhidos e abrem pelo teclado", async () => {
    const user = userEvent.setup();
    render(<ListaAvisos avisos={AVISOS} />);
    const botao = screen.getByRole("button", { name: "Informativos (3)" });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    const lista = document.getElementById(botao.getAttribute("aria-controls")!)!;
    expect(lista.className).toMatch(/(^| )hidden( |$)/);
    // recolhido na tela, mas sai na impressão
    expect(lista.className).toContain("print:grid");
    botao.focus();
    await user.keyboard("{Enter}");
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(lista.className).not.toMatch(/(^| )hidden( |$)/);
  });

  it("grupo grande de atenção mostra o resumo e abre os textos num botão; erro vem aberto", async () => {
    const user = userEvent.setup();
    render(<ListaAvisos avisos={AVISOS} />);
    const ver = screen.getByRole("button", { name: "Ver os 4 textos" });
    expect(ver.getAttribute("aria-expanded")).toBe("false");
    await user.click(ver);
    expect(ver.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Ocultar os textos" })).toBe(ver);
    // o erro (1 aviso) não tem botão: o texto já está aberto
    const erro = screen.getByText(naoConcluido.texto).closest("ul")!;
    expect(erro.className).not.toMatch(/(^| )hidden( |$)/);
  });

  it("modo original: selos 'do SISTRUT original' e 'verificação extra da V2' e a nota", () => {
    render(<ListaAvisos avisos={AVISOS} modo="original" />);
    expect(screen.getAllByText("do SISTRUT original")).toHaveLength(2);
    expect(screen.getAllByText("verificação extra da V2")).toHaveLength(1);
    expect(screen.getByText(/“Do SISTRUT original”: avisos do motor/)).toBeTruthy();
  });

  it("modo corrigido: só o detalhamento leva selo", () => {
    render(<ListaAvisos avisos={AVISOS} modo="corrigido" />);
    expect(screen.queryByText("do SISTRUT original")).toBeNull();
    expect(screen.getAllByText("verificação de detalhamento da V2")).toHaveLength(1);
    expect(screen.getByText(/“Verificação de detalhamento da V2”/)).toBeTruthy();
  });

  it("sem as duas origens, sem a nota", () => {
    render(<ListaAvisos avisos={[naoConcluido]} modo="original" />);
    expect(screen.queryByText(/“Do SISTRUT original”/)).toBeNull();
  });

  it("expandido (relatório): nenhum botão de abrir e nada recolhido", () => {
    const { container } = render(<ListaAvisos avisos={AVISOS} expandido />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelectorAll("ul.hidden")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Informativos (3)" })).toBeTruthy();
  });
});

describe("ListaAvisosImportacao", () => {
  const avisos = [
    "ALTO.VIG: Viga V3: cargas do .VIG diferentes das da montagem: valem as do .VIG.",
    "ALTO.VIG: Viga V5: cargas do .VIG diferentes das da montagem: valem as do .VIG.",
    "BAIXO.VIG: Viga V3: cargas do .VIG diferentes das da montagem: valem as do .VIG.",
    "OBRA.COL: O .COL usa a parametrização XYZ.PIP, que não foi passada: ficam os parâmetros de fábrica.",
  ];

  it("agrupa por severidade, junta os repetidos e mostra cada texto inteiro", () => {
    render(<ListaAvisosImportacao avisos={avisos} />);
    expect(screen.getByRole("heading", { name: "Atenção de engenharia (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Informativos (3)" })).toBeTruthy();
    expect(screen.getByText("Parâmetros que não vieram")).toBeTruthy();
    const grupo = screen.getByText("Cargas do .VIG diferentes das da montagem").closest("li")!;
    expect(within(grupo).getByText("ALTO V3, V5; BAIXO V3")).toBeTruthy();
    for (const t of avisos) expect(screen.getByText(t)).toBeTruthy();
  });
});
