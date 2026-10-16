import { describe, expect, test } from "vitest";
import {
  AVISO_CORTE,
  LIMITE_URL,
  marcadorRelato,
  corpoRelato,
  cortar,
  tituloRelato,
  urlIssue,
  urlNovaIssue,
  type AnexosCorpo,
} from "./corpoIssue";
import type { Diagnostico } from "./diagnostico";

const diag: Diagnostico = {
  itens: [
    { rotulo: "Rota", valor: "/openstrut/obra" },
    { rotulo: "Obra", valor: 'Casa | "A", 2 pavimentos' },
  ],
  erros: [],
  build: "dd703d2",
};
const texto = { aconteceu: "O momento saiu negativo\nna viga V3", esperado: "Positivo", email: "" };
const github: AnexosCorpo = { destino: "github", print: "relato.png", obra: "casa.openstrut.json" };

const parametros = (url: string) => {
  const u = new URL(url);
  return { u, title: u.searchParams.get("title"), body: u.searchParams.get("body") };
};

describe("título", () => {
  test("usa a primeira linha do que aconteceu", () => {
    expect(tituloRelato("  O momento saiu negativo\nna viga V3")).toBe(
      "[Relato] O momento saiu negativo",
    );
  });
  test("vazio vira um título genérico", () => {
    expect(tituloRelato("   ")).toBe("[Relato] problema no app");
  });
  test("corta em 80 caracteres sem partir emoji", () => {
    const t = tituloRelato("🏗️".repeat(100));
    expect(t.endsWith("…")).toBe(true);
    expect(() => encodeURIComponent(t)).not.toThrow();
  });
});

describe("cortar", () => {
  test("conta por code point", () => {
    expect(cortar("a😀b", 2)).toBe("a😀…");
    expect(cortar("abc", 3)).toBe("abc");
  });
});

describe("corpo", () => {
  test("traz as seções, a instrução de colar o print e a obra como arquivo", () => {
    const c = corpoRelato(texto, diag, github);
    expect(c).toContain("### O que aconteceu\n\nO momento saiu negativo\nna viga V3");
    expect(c).toContain("### O que esperava\n\nPositivo");
    expect(c).toContain("Cole o print aqui (Ctrl+V)");
    expect(c).toContain("`relato.png`");
    expect(c).toContain("`casa.openstrut.json`");
    expect(c).toContain("_Nenhum erro registrado no console._");
    expect(c).not.toContain("### Contato");
  });
  test("escapa a barra vertical na tabela do diagnóstico", () => {
    expect(corpoRelato(texto, diag, github)).toContain('| Obra | Casa \\| "A", 2 pavimentos |');
  });
  test("sem print e sem obra, diz que não há print e omite a seção da obra", () => {
    const c = corpoRelato(texto, diag, { destino: "github", print: null, obra: null });
    expect(c).toContain("_O usuário não anexou o print._");
    expect(c).not.toContain("### Obra");
  });
  test("o bloco dos erros tem cerca maior que as crases do erro", () => {
    const d = { ...diag, erros: ["falhou ```x``` e ````y````"] };
    const c = corpoRelato(texto, d, github);
    expect(c).toContain("`````text\nfalhou ```x``` e ````y````\n`````");
  });
  test("e-mail preenchido entra na seção de contato", () => {
    expect(corpoRelato({ ...texto, email: " eng@x.com " }, diag, github)).toContain(
      "### Contato\n\neng@x.com",
    );
  });
});

describe("marcador da triagem", () => {
  const MARCADOR = "<!-- openstrut-relato v1 build=dd703d2 -->";
  test("o corpo termina com o marcador oculto e o build", () => {
    expect(
      corpoRelato(texto, diag, github).endsWith(`

${MARCADOR}`),
    ).toBe(true);
  });
  test("continua no fim quando a URL corta erros e textos", () => {
    const enorme = "x".repeat(20_000);
    const erros = Array.from({ length: 20 }, (_, i) => `erro ${i} ${"y".repeat(1990)}`);
    const { url, cortado } = urlNovaIssue(
      { aconteceu: enorme, esperado: enorme, email: "" },
      { ...diag, erros },
      github,
    );
    expect(cortado).toBe(true);
    expect(new URL(url).searchParams.get("body")?.endsWith(MARCADOR)).toBe(true);
    expect(new URL(url).searchParams.get("title")?.startsWith("[Relato] ")).toBe(true);
  });
  test("o build não fecha o comentário nem injeta texto", () => {
    expect(marcadorRelato("abc--> <b>x</b>")).toBe("<!-- openstrut-relato v1 build=abc-bxb -->");
    expect(marcadorRelato("")).toBe("<!-- openstrut-relato v1 build=desconhecido -->");
    expect(marcadorRelato("index-B2x9.js")).toBe(
      "<!-- openstrut-relato v1 build=index-B2x9.js -->",
    );
  });
});

describe("URL de nova issue", () => {
  test("bem formada, com título, corpo e label bug, sem corte", () => {
    const { url, cortado } = urlNovaIssue(texto, diag, github);
    const { u, title, body } = parametros(url);
    expect(u.origin + u.pathname).toBe("https://github.com/gmunaro/openstrut/issues/new");
    expect(u.searchParams.get("labels")).toBe("bug");
    expect(title).toBe("[Relato] O momento saiu negativo");
    expect(body).toBe(corpoRelato(texto, diag, github));
    expect(cortado).toBe(false);
  });

  test("com 20 erros longos, tira os mais antigos e cabe no limite", () => {
    const erros = Array.from({ length: 20 }, (_, i) => `erro ${i} ${"x".repeat(1990)}`);
    const { url, cortado } = urlNovaIssue(texto, { ...diag, erros }, github);
    const { body } = parametros(url);
    expect(url.length).toBeLessThanOrEqual(LIMITE_URL);
    expect(cortado).toBe(true);
    expect(body).toContain("erro 19 ");
    expect(body).not.toContain("erro 0 ");
    expect(body).toMatch(/\d+ erro\(s\) mais antigo\(s\) ficaram de fora/);
  });

  test("descrição enorme com acentos e emoji é cortada com aviso e continua válida", () => {
    const enorme = "ção 🏗️ ".repeat(8000);
    const { url, cortado } = urlNovaIssue(
      { aconteceu: enorme, esperado: enorme, email: "" },
      diag,
      github,
    );
    expect(url.length).toBeLessThanOrEqual(LIMITE_URL);
    expect(cortado).toBe(true);
    const { body } = parametros(url);
    expect(body).toContain(AVISO_CORTE);
    expect(body).toContain("### Diagnóstico");
  });

  test("respeita um limite menor dado", () => {
    const { url } = urlNovaIssue({ ...texto, aconteceu: "a".repeat(3000) }, diag, github, 3000);
    expect(url.length).toBeLessThanOrEqual(3000);
  });

  test("a URL nunca leva o conteúdo da obra, só o nome do arquivo", () => {
    const { body } = parametros(urlNovaIssue(texto, diag, github).url);
    expect(body).toContain("casa.openstrut.json");
    expect(body).not.toContain('"versao"');
  });

  test("urlIssue codifica espaço, quebra de linha e acento", () => {
    const url = urlIssue("a b", "ç\n&");
    expect(url).toContain("title=a+b");
    expect(url).toContain("body=%C3%A7%0A%26");
  });
});
