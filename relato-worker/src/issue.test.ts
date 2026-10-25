import { describe, expect, it } from "vitest";
import {
  blocoDeCodigo,
  celula,
  citar,
  corpoIssue,
  marcadorRelato,
  neutralizarMencoes,
  tituloIssue,
} from "./issue";
import type { Relato } from "./tipos";

const ZWSP = "​";

const relato: Relato = {
  titulo: "Erro",
  aconteceu: "linha 1\n\nlinha 3",
  esperado: "",
  email: undefined,
  diagnostico: [],
  erros: [],
  build: "dd703d2",
  print: undefined,
  obra: undefined,
  turnstile: undefined,
  robo: false,
};
const anexos = {
  repoArquivos: "gmunaro/openstrut",
  branch: "relatos",
  id: "2026-10-16-abcd1234",
  temPrint: false,
  nomeObra: undefined,
};

describe("sanitização", () => {
  it("neutraliza menções com espaço de largura zero", () => {
    expect(neutralizarMencoes("oi @gmunaro e @org/time")).toBe(
      `oi @${ZWSP}gmunaro e @${ZWSP}org/time`,
    );
    expect(neutralizarMencoes("custa @ 5")).toBe("custa @ 5");
    expect(tituloIssue("@fulano quebrou")).toBe(`[Relato] @${ZWSP}fulano quebrou`);
  });

  it("cita cada linha", () => {
    expect(citar("a\n\nb")).toBe("> a\n>\n> b");
  });

  it("quebra corridas de crases dentro do bloco de código", () => {
    const bloco = blocoDeCodigo("antes\n```\nfora\n`````");
    expect(bloco.startsWith("```text\n")).toBe(true);
    expect(bloco.endsWith("\n```")).toBe(true);
    const miolo = bloco.slice("```text\n".length, -"\n```".length);
    expect(miolo).not.toMatch(/`{3,}/);
    expect(miolo).toContain(`\`${ZWSP}\`${ZWSP}\``);
  });

  it("escapa barra vertical, barra invertida e quebra de linha na célula", () => {
    expect(celula("a|b\nc\\d @x")).toBe(`a\\|b<br>c\\\\d @${ZWSP}x`);
  });
});

describe("corpoIssue", () => {
  it("põe o que aconteceu em citação e diz que não há contato", () => {
    const corpo = corpoIssue(relato, anexos);
    expect(corpo).toContain("### O que aconteceu\n\n> linha 1\n>\n> linha 3");
    expect(corpo).toContain("_Não informado._");
    expect(corpo).toContain("O autor não deixou e-mail de contato.");
    expect(corpo).toContain("Enviado pelo botão Relatar problema do OpenStrut (relay)");
    expect(corpo).not.toContain("### Print");
    expect(corpo).not.toContain("### Últimos erros");
  });

  it("monta a tabela de diagnóstico", () => {
    const corpo = corpoIssue(
      { ...relato, diagnostico: [{ rotulo: "Norma", valor: "NBR|6118" }] },
      anexos,
    );
    expect(corpo).toContain("| Item | Valor |\n| --- | --- |\n| Norma | NBR\\|6118 |");
  });

  it("cabe no limite do GitHub mesmo com tudo no máximo", () => {
    const corpo = corpoIssue(
      {
        ...relato,
        aconteceu: "@".repeat(5000),
        esperado: "@".repeat(5000),
        diagnostico: Array.from({ length: 30 }, () => ({
          rotulo: "|".repeat(60),
          valor: "|".repeat(1000),
        })),
        erros: Array.from({ length: 20 }, () => "`".repeat(2000)),
      },
      anexos,
    );
    expect(corpo.length).toBeLessThanOrEqual(65_536);
  });

  it("anexos no repositório privado: links, sem imagem embutida", () => {
    const corpo = corpoIssue(relato, {
      ...anexos,
      repoArquivos: "gmunaro/openstrut-relatos",
      temPrint: true,
      nomeObra: "obra.openstrut.json",
      separados: true,
    });
    const base = "https://github.com/gmunaro/openstrut-relatos/blob/relatos/relatos/2026-10-16-abcd1234";
    expect(corpo).toContain(`[print.png](${base}/print.png) (no repositório privado dos anexos)`);
    expect(corpo).toContain(`[obra.openstrut.json](${base}/obra.openstrut.json)`);
    expect(corpo).not.toContain("raw.githubusercontent.com");
    expect(corpo).not.toContain("![print]");
  });
});

describe("marcador da triagem", () => {
  const MARCADOR = "<!-- openstrut-relato v1 build=dd703d2 -->";
  it("o corpo termina com o marcador oculto e o build", () => {
    expect(
      corpoIssue(relato, anexos).endsWith(`

${MARCADOR}`),
    ).toBe(true);
  });
  it("continua no fim quando o corpo passa do limite do GitHub", () => {
    const grande = { ...relato, aconteceu: "x".repeat(70_000) };
    const corpo = corpoIssue(grande, anexos);
    expect(corpo.length).toBeLessThanOrEqual(65_536);
    expect(corpo.endsWith(MARCADOR)).toBe(true);
    expect(corpo).toContain("… (truncado)");
  });
  it("sem build vira desconhecido; build sujo não fecha o comentário", () => {
    expect(marcadorRelato(undefined)).toBe("<!-- openstrut-relato v1 build=desconhecido -->");
    expect(marcadorRelato("abc--> <b>x</b>")).toBe("<!-- openstrut-relato v1 build=abc-bxb -->");
  });
});
