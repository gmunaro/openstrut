import { describe, expect, it } from "vitest";
import { PNG_BASE64, relatoBase } from "./apoioTeste";
import { nomeSeguroObra, validarRelato } from "./validar";

function mensagem(corpo: unknown) {
  const r = validarRelato(corpo);
  return r.ok ? "ok" : r.mensagem;
}

describe("validarRelato", () => {
  it("aceita o relato mínimo e apara os textos", () => {
    const r = validarRelato(relatoBase({ titulo: "  Erro na laje  " }));
    expect(r.ok && r.relato.titulo).toBe("Erro na laje");
    expect(r.ok && r.relato.robo).toBe(false);
  });

  it("recusa corpo que não é objeto e versão desconhecida", () => {
    expect(mensagem([])).toBe("O relato chegou num formato inválido.");
    expect(mensagem({ ...relatoBase(), versao: 2 })).toMatch(/Versão do relato/);
  });

  it("explica o campo vazio ou longo demais", () => {
    expect(mensagem(relatoBase({ aconteceu: "   " }))).toBe(
      'O campo "O que aconteceu" está vazio.',
    );
    expect(mensagem(relatoBase({ titulo: "" }))).toBe('O campo "Título" está vazio.');
    expect(mensagem(relatoBase({ titulo: "a".repeat(121) }))).toBe(
      'O campo "Título" passa de 120 caracteres.',
    );
    expect(mensagem(relatoBase({ titulo: "linha 1\nlinha 2" }))).toMatch(/quebra de linha/);
    expect(mensagem(relatoBase({ esperado: "a".repeat(5001) }))).toMatch(/5000 caracteres/);
    // 120 caracteres fora do BMP contam como 120, não 240.
    expect(mensagem(relatoBase({ titulo: "🏗".repeat(120) }))).toBe("ok");
  });

  it("confere e-mail, diagnóstico e erros", () => {
    expect(mensagem(relatoBase({ email: "sem-arroba" }))).toMatch(/e-mail/);
    expect(mensagem(relatoBase({ email: `${"a".repeat(195)}@b.com` }))).toMatch(/200 caracteres/);
    const vazio = validarRelato(relatoBase({ email: "" }));
    expect(vazio.ok && vazio.relato.email).toBeUndefined();
    const itens = Array.from({ length: 31 }, () => ({ rotulo: "a", valor: "b" }));
    expect(mensagem(relatoBase({ diagnostico: itens }))).toMatch(/30 itens/);
    expect(mensagem(relatoBase({ diagnostico: [{ rotulo: "a".repeat(61), valor: "" }] }))).toMatch(
      /tamanho permitido/,
    );
    expect(mensagem(relatoBase({ erros: Array.from({ length: 21 }, () => "x") }))).toMatch(
      /20 itens/,
    );
    expect(mensagem(relatoBase({ erros: ["x".repeat(2001)] }))).toMatch(/2000 caracteres/);
    expect(mensagem(relatoBase({ build: "x".repeat(101) }))).toMatch(/build/);
    expect(mensagem({ ...relatoBase(), build: 7 })).toMatch(/build/);
  });

  it("recusa mais de 5 links somando aconteceu e esperado", () => {
    const links = (n: number) =>
      Array.from({ length: n }, (_, i) => `https://x.com/${i}`).join(" ");
    expect(mensagem(relatoBase({ aconteceu: links(3), esperado: links(2) }))).toBe("ok");
    expect(
      mensagem(relatoBase({ aconteceu: links(3), esperado: `${links(2)} http://y.com` })),
    ).toBe("O relato tem links demais (máximo 5).");
  });

  it("exige PNG de verdade no print", () => {
    expect(mensagem(relatoBase({ print: PNG_BASE64 }))).toBe("ok");
    expect(mensagem(relatoBase({ print: btoa("GIF89a-nao-e-png") }))).toBe(
      "O print não é uma imagem PNG válida.",
    );
    expect(mensagem(relatoBase({ print: `data:image/png;base64,${PNG_BASE64}` }))).toBe(
      "O print não é uma imagem PNG válida.",
    );
    // 3 MiB + 3 bytes em base64, sem precisar decodificar tudo.
    const grande = PNG_BASE64 + "A".repeat(((3 * 1024 * 1024) / 3) * 4);
    expect(mensagem(relatoBase({ print: grande }))).toBe("O print passa de 3 MiB.");
  });

  it("exige JSON válido na obra e normaliza o nome", () => {
    expect(mensagem(relatoBase({ obra: { nome: "a.json", json: "{ruim" } }))).toBe(
      "O arquivo da obra não é um JSON válido.",
    );
    expect(
      mensagem(relatoBase({ obra: { nome: "a.json", json: `"${"x".repeat(2 * 1024 * 1024)}"` } })),
    ).toBe("O arquivo da obra passa de 2 MiB.");
    const r = validarRelato(
      relatoBase({ obra: { nome: "Prédio A/../x.openstrut.json", json: "{}" } }),
    );
    expect(r.ok && r.relato.obra?.nome).toBe("Pr_dio_A_.._x.openstrut.json");
  });

  it("marca o honeypot preenchido", () => {
    const r = validarRelato(relatoBase({ site: "http://spam" }));
    expect(r.ok && r.relato.robo).toBe(true);
  });
});

describe("nomeSeguroObra", () => {
  it("termina sempre em .json e não começa com ponto", () => {
    expect(nomeSeguroObra("obra")).toBe("obra.json");
    expect(nomeSeguroObra("Obra.JSON")).toBe("Obra.json");
    expect(nomeSeguroObra("..")).toBe("obra.json");
    expect(nomeSeguroObra("")).toBe("obra.json");
    expect(nomeSeguroObra("casa nova (2).sistrut.json")).toBe("casa_nova__2_.sistrut.json");
  });
});
