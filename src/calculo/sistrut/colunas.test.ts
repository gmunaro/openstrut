// Colunas do edifício (calcularPilaresSistrut): lances de pavimentos seguidos formam uma
// coluna quando o pilar está na mesma posição, ou quando ele tem o mesmo nome e as
// seções se sobrepõem na planta (o mesmo pilar desenhado noutro ponto da seção, como o
// térreo de uma obra importada do original, onde a coluna é a do .COL e a posição não
// entra: PIGRAEDI.BAS:466-583 não grava posição). Obra: a E2E (9 pilares 20 × 20) em
// dois pavimentos.
import { describe, expect, it } from "vitest";
import type { Obra, Pavimento } from "../../dominio/obra";
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
function predio(muda: { x?: number; nome?: string }): Obra {
  const baixo = pavimento("BAIXO");
  baixo.pilares = baixo.pilares.map((p) => (p.nome === "P5" ? { ...p, ...muda } : p));
  return { ...obraE2E("original"), pavimentos: [pavimento("CIMA"), baixo] };
}

/** Ids dos pilares de cada coluna. */
const colunas = (obra: Obra) => {
  const r = calcularObraSistrut(obra, { modo: "original" });
  const porColuna = new Map<string, string[]>();
  for (const l of r.lances)
    porColuna.set(l.coluna, [...(porColuna.get(l.coluna) ?? []), l.pilarId]);
  return { lista: [...porColuna.values()], falhas: r.falhas.map((f) => f.texto) };
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
});
