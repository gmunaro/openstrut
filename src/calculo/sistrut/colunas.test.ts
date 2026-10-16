// Colunas do edifício (calcularPilaresSistrut): lances de pavimentos seguidos formam uma
// coluna quando o pilar está na mesma posição, ou quando ele tem o mesmo nome e as
// seções se sobrepõem na planta (o mesmo pilar desenhado noutro ponto da seção, como o
// térreo de uma obra importada do original, onde a coluna é a do .COL e a posição não
// entra: PIGRAEDI.BAS:466-583 não grava posição). Obra: a E2E (9 pilares 20 × 20) em
// dois pavimentos.
import { describe, expect, it } from "vitest";
import type { Obra, Pavimento, Pilar } from "../../dominio/obra";
import { obraE2E } from "./__e2e__/obraE2E";
import { calcularObraSistrut } from "./obra";

/** O pavimento da E2E com os ids prefixados (ids são únicos na obra). */
function pavimento(prefixo: string): Pavimento {
  const [pav] = obraE2E("original").pavimentos;
  const comPrefixo = <T extends { id: string }>(x: T): T => ({ ...x, id: `${prefixo}/${x.id}` });
  return {
    ...pav!,
    id: prefixo,
    nome: prefixo,
    lajes: pav!.lajes.map(comPrefixo),
    vigas: pav!.vigas.map(comPrefixo),
    pilares: pav!.pilares.map(comPrefixo),
  };
}

/** Dois pavimentos (CIMA sobre BAIXO); `muda` altera o P5 de BAIXO, em (4; 5). */
function predio(muda: Partial<Pilar>): Obra {
  const baixo = pavimento("BAIXO");
  baixo.pilares = baixo.pilares.map((p) => (p.nome === "P5" ? { ...p, ...muda } : p));
  return { ...obraE2E("original"), pavimentos: [pavimento("CIMA"), baixo] };
}

/** Ids dos pilares de cada coluna. */
const colunas = (obra: Obra) => {
  const r = calcularObraSistrut(obra, { modo: "original" });
  const porColuna = new Map<string, string[]>();
  const avisos = r.lances.flatMap((l) => l.avisos).filter((a) => /deslocado/.test(a));
  for (const l of r.lances)
    porColuna.set(l.coluna, [...(porColuna.get(l.coluna) ?? []), l.pilarId]);
  return { lista: [...porColuna.values()], falhas: r.falhas.map((f) => f.texto), avisos };
};

describe("colunas: o mesmo pilar em posições diferentes", () => {
  it("na mesma posição: 9 colunas de 2 lances", () => {
    const { lista, falhas } = colunas(predio({}));
    expect(lista).toHaveLength(9);
    expect(lista.every((c) => c.length === 2)).toBe(true);
    expect(falhas).toEqual([]);
  });

  it("deslocado 5 cm com o mesmo nome (seções de 20 cm se sobrepõem): a coluna continua", () => {
    const { lista, falhas } = colunas(predio({ x: 4.05 }));
    expect(lista).toHaveLength(9);
    expect(lista).toContainEqual(expect.arrayContaining(["BAIXO/P5", "CIMA/P5"]));
    expect(falhas).toEqual([]);
  });

  it("deslocado 5 cm com outro nome: são dois pilares, e o de cima nasce sobre a viga", () => {
    const { lista, falhas } = colunas(predio({ x: 4.05, nome: "P10" }));
    expect(lista).toHaveLength(10);
    expect(falhas).toEqual([
      expect.stringContaining("Pilar P5 do pavimento CIMA nasce acima da fundação"),
    ]);
  });

  it("deslocado 50 cm com o mesmo nome (seções sem sobreposição): são dois pilares", () => {
    const { lista } = colunas(predio({ x: 4.5 }));
    expect(lista).toHaveLength(10);
  });

  it("a fusão avisa no lance de cima, com o deslocamento em cm", () => {
    const { avisos } = colunas(predio({ x: 4.05 }));
    expect(avisos).toEqual([
      "P5: lance deslocado 5 cm do de baixo na planta; tratado como a mesma coluna, como no .COL do original, e o deslocamento não entra no cálculo (sem excentricidade).",
    ]);
  });

  it("pilar de cima marcado sobre viga de transição não continua o de baixo", () => {
    const obra = predio({});
    const [cima] = obra.pavimentos;
    cima!.pilares = cima!.pilares.map((p) =>
      p.nome === "P5" ? { ...p, x: 4.05, transicao: true } : p,
    );
    const { lista, avisos } = colunas(obra);
    expect(lista).toHaveLength(10);
    expect(avisos).toEqual([]);
  });

  it("a sobreposição usa a seção girada: 60 × 20 a 90° tem 20 cm em x", () => {
    // deslocado 25 cm em x: sem giro, 60 + 60 cm se sobrepõem; girados, 20 + 20 cm não
    const giro = (rotacao: number) => {
      const obra = predio({ x: 4.25, b: 60, h: 20, rotacao });
      obra.pavimentos[0]!.pilares = obra.pavimentos[0]!.pilares.map((p) =>
        p.nome === "P5" ? { ...p, b: 60, h: 20, rotacao } : p,
      );
      return colunas(obra).lista.length;
    };
    expect(giro(0)).toBe(9);
    expect(giro(90)).toBe(10);
  });
});
