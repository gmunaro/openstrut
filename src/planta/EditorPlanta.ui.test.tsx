// Editor de planta dentro da tela da obra (app inteiro em memória), usado como o
// usuário: ferramentas, arrasto do ponteiro no SVG, painel de propriedades,
// teclado (Delete, Ctrl+Z, Ctrl+Y, Esc) e mensagens de erro.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { obraNova } from "../dominio/criar";
import { useObra } from "../estado/obra";
import { abrirObra, renderizarApp } from "../test-setup";
import { PILAR_FORA_DA_VIGA } from "./edicao";

// Vista inicial de um pavimento vazio numa área de 800 × 600 px (test-setup):
// enquadrar a caixa 10 × 8 m com margem de 48 px dá
// escala = min((800 − 96)/10, (600 − 96)/8) = min(70,4; 63) = 63 px/m;
// centro (5; 4) m no centro da tela (400; 300) px → ox = 400 − 5·63 = 85, oy = 300 + 4·63 = 552.
// O y da tela cresce para baixo.
const ESCALA = 63;
const tela = (x: number, y: number) => ({ clientX: 85 + x * ESCALA, clientY: 552 - y * ESCALA });

const pavimento = () => {
  const p = useObra.getState().obra?.pavimentos[0];
  if (!p) throw new Error("sem pavimento");
  return p;
};

async function abrirEditor(nome = "Planta teste") {
  abrirObra(obraNova(nome, "nb1-78"));
  const { user } = renderizarApp("/obra");
  const svg = await screen.findByRole("application", { name: "Planta do pavimento" });
  // a grade só aparece depois que a vista foi enquadrada
  await waitFor(() => expect(svg.querySelector("line")).not.toBeNull());
  return { user, svg };
}

/** Arrasta com o botão esquerdo de (x1; y1) a (x2; y2), em metros do mundo. */
async function arrastar(user: UserEvent, svg: Element, a: [number, number], b: [number, number]) {
  await user.pointer([
    { keys: "[MouseLeft>]", target: svg, coords: tela(...a) },
    { target: svg, coords: tela(...b) },
    { keys: "[/MouseLeft]", target: svg, coords: tela(...b) },
  ]);
}

const botao = (nome: string) => screen.getByRole("button", { name: nome });
const mensagem = () =>
  within(screen.getByRole("application").closest("div.flex-col") as HTMLElement).queryByRole(
    "status",
  );

describe("editor de planta", () => {
  it("desenha uma laje arrastando: mundo↔tela, snap, vigas e pilares gerados", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    expect(botao("Laje").getAttribute("aria-pressed")).toBe("true");

    // começa um pouco fora do canto (0,1 m): o snap à grade de 0,5 m leva a (0; 0)
    await user.pointer([
      { keys: "[MouseLeft>]", target: svg, coords: tela(0.1, 0.1) },
      { target: svg, coords: tela(4, 5) },
    ]);
    // durante o arrasto: coordenada do cursor e prévia com as cotas
    expect(screen.getByText(/x = 4,00\s+y = 5,00 m/)).toBeTruthy();
    expect(within(svg).getByText("lx = 4,00 m")).toBeTruthy();
    expect(within(svg).getByText("ly = 5,00 m")).toBeTruthy();
    await user.pointer({ keys: "[/MouseLeft]", target: svg, coords: tela(4, 5) });

    const pav = pavimento();
    expect(pav.lajes).toHaveLength(1);
    expect(pav.lajes[0]).toMatchObject({ nome: "L1", x: 0, y: 0, lx: 4, ly: 5, h: 10 });
    // uma viga em cada bordo e um pilar em cada canto
    expect(pav.vigas).toHaveLength(4);
    expect(pav.pilares.map((p) => [p.x, p.y]).sort()).toEqual(
      [
        [0, 0],
        [0, 5],
        [4, 0],
        [4, 5],
      ].sort(),
    );
    // desenhada na posição certa: retângulo de tela (85; 237) com 252 × 315 px
    const rect = within(svg).getByText("L1").parentElement?.querySelector("rect");
    expect(rect?.getAttribute("x")).toBe("85");
    expect(rect?.getAttribute("y")).toBe("237");
    expect(rect?.getAttribute("width")).toBe("252");
    expect(rect?.getAttribute("height")).toBe("315");
    // a laje nova fica selecionada e o painel mostra as propriedades
    expect(useObra.getState().selecao).toEqual({ tipo: "laje", id: pav.lajes[0]?.id });
    expect(screen.getByDisplayValue("L1")).toBeTruthy();
    // a obra é calculada e a planta mostra a legenda das situações
    expect(screen.getByText("Passe o mouse para ver os avisos.")).toBeTruthy();
  });

  it("recusa laje sobreposta com mensagem e aceita laje encostada", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    await arrastar(user, svg, [2, 0], [6, 5]);
    expect(mensagem()?.textContent).toMatch(/^A laje se sobrepõe à L1\. Encoste-a/);
    expect(pavimento().lajes).toHaveLength(1);

    await arrastar(user, svg, [4, 0], [8, 5]);
    const pav = pavimento();
    expect(pav.lajes.map((l) => l.nome)).toEqual(["L1", "L2"]);
    expect(pav.lajes[1]).toMatchObject({ x: 4, y: 0, lx: 4, ly: 5 });
    expect(pav.pilares).toHaveLength(6);
  });

  it("clique sem arrastar não cria laje e explica o que fazer", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [1, 1], [1, 1]);
    expect(mensagem()?.textContent).toBe(
      "Para desenhar a laje, arraste de um canto ao canto oposto.",
    );
    expect(pavimento().lajes).toHaveLength(0);
  });

  it("seleciona a laje com clique, muda h no painel e o estado acompanha", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    await user.keyboard("{Escape}"); // volta para Selecionar
    expect(botao("Selecionar").getAttribute("aria-pressed")).toBe("true");
    await user.keyboard("{Escape}"); // limpa a seleção
    expect(useObra.getState().selecao).toBeNull();

    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: tela(2, 2.5) });
    expect(useObra.getState().selecao?.tipo).toBe("laje");

    const h = screen.getByLabelText(/Espessura h/);
    expect((h as HTMLInputElement).value).toBe("10");
    await user.clear(h);
    await user.type(h, "12,5{Enter}");
    expect(pavimento().lajes[0]?.h).toBe(12.5);

    // valor inválido: erro embaixo do campo e o estado não muda
    const h2 = screen.getByLabelText(/Espessura h/);
    await user.clear(h2);
    await user.type(h2, "0{Enter}");
    expect(screen.getByText("A espessura h precisa ser maior que zero.")).toBeTruthy();
    expect(pavimento().lajes[0]?.h).toBe(12.5);
  });

  it("μ da laje: editável com a NB-1/78, recusa zero e some com a NBR 6118:2023", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    await user.keyboard("{Escape}");
    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: tela(2, 2.5) });

    const mu = screen.getByLabelText(/^μ/);
    expect(mu.closest("label")?.textContent).toBe("μ (relação my/mx)");
    expect((mu as HTMLInputElement).value).toBe("1");
    await user.clear(mu);
    await user.type(mu, "1,5{Enter}");
    expect(pavimento().lajes[0]?.mu).toBe(1.5);

    const mu2 = screen.getByLabelText(/^μ/);
    await user.clear(mu2);
    await user.type(mu2, "0{Enter}");
    expect(screen.getByText("A relação μ = my/mx precisa ser maior que zero.")).toBeTruthy();
    expect(pavimento().lajes[0]?.mu).toBe(1.5);

    useObra.getState().editar((o) => ({ ...o, norma: "nbr6118-2023" }));
    await waitFor(() => expect(screen.queryByLabelText(/^μ/)).toBeNull());
  });

  it("seleciona viga e pilar com clique e edita a viga", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    await user.click(botao("Selecionar"));

    // meio do bordo inferior: viga
    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: tela(2, 0) });
    const sel = useObra.getState().selecao;
    expect(sel?.tipo).toBe("viga");
    const bw = screen.getByLabelText(/^bw/);
    await user.clear(bw);
    await user.type(bw, "15{Enter}");
    expect(pavimento().vigas.find((v) => v.id === sel?.id)?.bw).toBe(15);

    // canto: pilar
    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: tela(4, 5) });
    expect(useObra.getState().selecao?.tipo).toBe("pilar");
    expect(screen.getByText("Centro (4,00; 5,00) m")).toBeTruthy();
  });

  it("ferramenta Pilar: aceita sobre o eixo de viga e recusa fora dele", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    await user.keyboard("p");
    expect(botao("Pilar").getAttribute("aria-pressed")).toBe("true");

    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: tela(2, 2) });
    expect(mensagem()?.textContent).toBe(PILAR_FORA_DA_VIGA);
    expect(pavimento().pilares).toHaveLength(4);

    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: tela(2, 0) });
    const pilares = pavimento().pilares;
    expect(pilares).toHaveLength(5);
    expect(pilares.at(-1)).toMatchObject({ nome: "P5", x: 2, y: 0, b: 20, h: 20 });
  });

  it("Delete apaga a laje selecionada; Ctrl+Z desfaz e Ctrl+Y refaz", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    expect(useObra.getState().selecao?.tipo).toBe("laje");

    await user.keyboard("{Delete}");
    expect(pavimento().lajes).toHaveLength(0);
    expect(pavimento().vigas).toHaveLength(0);
    expect(pavimento().pilares).toHaveLength(0);
    expect(within(svg).queryByText("L1")).toBeNull();

    await user.keyboard("{Control>}z{/Control}");
    expect(pavimento().lajes.map((l) => l.nome)).toEqual(["L1"]);
    expect(pavimento().vigas).toHaveLength(4);
    expect(within(svg).getByText("L1")).toBeTruthy();

    await user.keyboard("{Control>}y{/Control}");
    expect(pavimento().lajes).toHaveLength(0);

    // botões da barra fazem o mesmo
    await user.click(screen.getAllByRole("button", { name: /^Desfazer/ })[0] as HTMLElement);
    expect(pavimento().lajes).toHaveLength(1);
  });

  it("Delete com o foco num campo do painel não apaga o elemento", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    await user.click(screen.getByLabelText(/Espessura h/));
    await user.keyboard("{Delete}");
    expect(pavimento().lajes).toHaveLength(1);
  });

  it("apagar viga deixa os bordos livres e avisa como recriar", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    await user.click(botao("Selecionar"));
    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: tela(2, 0) });
    await user.click(screen.getByRole("button", { name: "Apagar (Delete)" }));
    expect(pavimento().vigas).toHaveLength(3);
    expect(pavimento().lajes[0]?.vinculos.inferior).toBe("livre");
    expect(mensagem()?.textContent).toMatch(/^Viga apagada/);
  });

  it("pan com o botão do meio move a vista sem mudar a obra", async () => {
    const { svg } = await abrirEditor();
    const antes = useObra.getState().obra;
    const linha = () => svg.querySelector("line")?.getAttribute("x1");
    const x0 = Number(linha());
    fireEvent.pointerDown(svg, { button: 1, pointerId: 1, ...tela(0, 0) });
    fireEvent.pointerMove(svg, {
      button: 1,
      pointerId: 1,
      clientX: tela(0, 0).clientX + 30,
      clientY: tela(0, 0).clientY,
    });
    fireEvent.pointerUp(svg, { button: 1, pointerId: 1 });
    await waitFor(() => expect(Number(linha())).not.toBe(x0));
    expect(useObra.getState().obra).toBe(antes);
  });
  it("atalhos não agem na planta com um diálogo aberto por cima", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    expect(useObra.getState().selecao?.tipo).toBe("laje");

    await user.click(screen.getByRole("button", { name: /Unidades/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Unidades" });
    within(dialogo).getAllByRole("radio")[0]?.focus();
    await user.keyboard("{Delete}");
    expect(pavimento().lajes).toHaveLength(1);
    await user.keyboard("{Control>}z{/Control}");
    expect(pavimento().lajes).toHaveLength(1);
    await user.keyboard("p");
    // fecha o diálogo: a ferramenta continua a Laje
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(botao("Laje").getAttribute("aria-pressed")).toBe("true");
  });

  it("trocar de pavimento mostra a planta dele e o desenho vai para o pavimento ativo", async () => {
    const { user, svg } = await abrirEditor();
    await user.click(botao("Laje"));
    await arrastar(user, svg, [0, 0], [4, 5]);
    await user.click(screen.getByRole("button", { name: "Novo pavimento" }));
    const svg2 = screen.getByRole("application", { name: "Planta do pavimento" });
    expect(within(svg2).queryByText("L1")).toBeNull();
    expect(screen.getByText(/Pavimento 2: 0 lajes/)).toBeTruthy();

    await user.click(botao("Laje"));
    await arrastar(user, svg2, [0, 0], [3, 3]);
    const [p2, p1] = useObra.getState().obra?.pavimentos ?? [];
    expect(p2?.lajes.map((l) => [l.nome, l.lx, l.ly])).toEqual([["L1", 3, 3]]);
    expect(p1?.lajes.map((l) => [l.nome, l.lx, l.ly])).toEqual([["L1", 4, 5]]);
  });
});
