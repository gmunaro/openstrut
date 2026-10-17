// Colunas do edifício (calcularPilaresSistrut): lances de pavimentos seguidos formam uma
// coluna quando o pilar está na mesma posição, ou quando ele tem o mesmo nome e as
// seções se sobrepõem na planta (o mesmo pilar desenhado noutro ponto da seção, como o
// térreo de uma obra importada do original, onde a coluna é a do .COL e a posição não
// entra: PIGRAEDI.BAS:466-583 não grava posição). Obra: a E2E (9 pilares 20 × 20) em
// dois pavimentos.
import { describe, expect, it } from "vitest";
import type { Obra, Pavimento, Pilar } from "../../dominio/obra";
import { obraE2E } from "./__e2e__/obraE2E";
import { KN_POR_TF } from "./base/unidades";
import { calcularObraSistrut } from "./obra";

/** O pavimento da E2E com os ids prefixados (ids são únicos na obra). */
function pavimento(prefixo: string): Pavimento {
  const [pav] = obraE2E("original").pavimentos;
  const comPrefixo = <T extends { id: string }>(x: T): T => ({
    ...x,
    id: `${prefixo}/${x.id}`,
  });
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
  return {
    lista: [...porColuna.values()],
    falhas: r.falhas.map((f) => f.texto),
    avisos,
  };
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

// Pilar que nasce no balanço de uma viga de transição, com a carga dele lançada na viga
// (o caso da obra real: o .COL do original declara a coluna contínua e o usuário lança a
// carga do pilar de cima como concentrada na viga de baixo). Obra mínima, conta à mão:
// BAIXO tem a viga V1 de (0; 0) a (4,1; 0) sobre PA (0; 0) e PB (4; 0), com um balanço
// de 0,10 m e só a concentrada P = 10 t na ponta; CIMA tem o PB na ponta do balanço,
// 10 cm ao lado do PB de baixo (seções 20 × 20 que se sobrepõem), com 10 t no topo.
// Reação da viga em PB: P·4,1/4 = 10,25 t; em PA: −P·0,1/4 = −0,25 t.
describe("colunas: pilar que nasce numa viga com a carga dele (dupla contagem)", () => {
  const P = 10;
  /** `f`: a concentrada na ponta do balanço, t (0 = sem); `nome`: o do pilar de cima;
   *  `extra`: pilares e vigas a mais no CIMA. */
  function transicao({
    f = P,
    nome = "PB",
    extra = [],
    vigasCima = [],
  }: {
    f?: number;
    nome?: string;
    extra?: Pilar[];
    vigasCima?: Obra["pavimentos"][number]["vigas"];
  } = {}): Obra {
    const base = obraE2E("original");
    const pilar = (id: string, x: number, mais: Partial<Pilar> = {}): Pilar => ({
      id,
      nome: id.split("/")[1]!,
      x,
      y: 0,
      b: 20,
      h: 20,
      ...mais,
    });
    const vazio = {
      repeticoes: 1,
      lajes: [],
      pilaresRemovidos: [],
      peDireito: 3,
    };
    return {
      ...base,
      pavimentos: [
        {
          ...vazio,
          id: "CIMA",
          nome: "CIMA",
          vigas: vigasCima,
          pilares: [
            pilar(`CIMA/${nome}`, 4.1, {
              cargaTopo: { normal: P * KN_POR_TF, momentos: [] },
            }),
            ...extra,
          ],
        },
        {
          ...vazio,
          id: "BAIXO",
          nome: "BAIXO",
          vigas: [
            {
              id: "BAIXO/V1",
              nome: "V1",
              x1: 0,
              y1: 0,
              x2: 4.1,
              y2: 0,
              bw: 20,
              h: 50,
              cargaLinear: 0,
              somenteCargasProprias: true,
              cargas: f
                ? [
                    {
                      tipo: "concentrada",
                      trecho: 1,
                      posicao: 0.1,
                      total: f * KN_POR_TF,
                    },
                  ]
                : [],
            },
          ],
          pilares: [pilar("BAIXO/PA", 0), pilar("BAIXO/PB", 4)],
        },
      ],
    };
  }
  /** Carga acumulada (sem peso próprio) na base de cada coluna, t, pelo pilar da base. */
  const cargas = (obra: Obra, modo: "original" | "corrigido") => {
    const r = calcularObraSistrut(obra, { modo });
    return {
      r,
      base: Object.fromEntries(r.fundacoes.map((f) => [f.pilarId, f.cargaAcumulada])),
      avisos: r.lances.flatMap((l) => l.avisos),
    };
  };

  it("original: a coluna continua, como no .COL, e PB leva 10 + 10,25 = 20,25 t, com aviso", () => {
    const { base, avisos } = cargas(transicao(), "original");
    expect(base["BAIXO/PB"]).toBeCloseTo(20.25, 4);
    expect(base["CIMA/PB"]).toBeUndefined();
    expect(avisos).toContain(
      "PB: nasce sobre a viga V1 do pavimento BAIXO, que tem 10,00 t de carga concentrada sob ele, e continua a coluna do PB de baixo, deslocado 10 cm, como no .COL do original. Se a concentrada é a carga deste pilar (10,00 t sem o peso próprio), 10,00 t chegam à fundação duas vezes, pela coluna e pela reação da viga. O modo corrigido não continua a coluna.",
    );
  });

  it("corrigido: o PB de cima não continua a coluna; a fundação de PB recebe só a reação, 10,25 t", () => {
    const { r, base, avisos } = cargas(transicao(), "corrigido");
    expect(base["BAIXO/PB"]).toBeCloseTo(10.25, 6);
    expect(base["BAIXO/PA"]).toBeCloseTo(-0.25, 6);
    // a coluna de cima nasce na viga e entrega a ela os 10 t do topo
    expect(base["CIMA/PB"]).toBeCloseTo(P, 6);
    expect(r.falhas).toEqual([]);
    expect(avisos).toContainEqual(
      expect.stringMatching(
        /^PB: nasce sobre a viga V1 do pavimento BAIXO, que tem 10,00 t de carga concentrada sob ele; a carga na base do pilar, .* chega à fundação por essa viga, e não por uma coluna de baixo\./,
      ),
    );
  });

  it("sem a concentrada na viga não há dupla contagem: nos dois modos a coluna continua (10 t)", () => {
    for (const modo of ["original", "corrigido"] as const) {
      const { base, avisos } = cargas(transicao({ f: 0 }), modo);
      expect(base["BAIXO/PB"]).toBeCloseTo(P, 4);
      expect(avisos).toContainEqual(
        expect.stringMatching(/^PB: lance deslocado 10 cm do de baixo/),
      );
    }
  });

  it("apoio sem carga sobre viga de transição (o de uma escada à parte): não vira coluna nem aviso de transição", () => {
    const apoio: Pilar = {
      id: "CIMA/A0",
      nome: "A0",
      x: 20,
      y: 20,
      b: 20,
      h: 20,
      transicao: true,
    };
    for (const modo of ["original", "corrigido"] as const) {
      const { r, base, avisos } = cargas(transicao({ extra: [apoio] }), modo);
      expect(base["CIMA/A0"]).toBeUndefined();
      expect(r.lances.some((l) => l.pilarId === "CIMA/A0")).toBe(false);
      expect(avisos.filter((a) => a.startsWith("A0:"))).toEqual([]);
      expect(r.pavimentos.find((p) => p.pavimentoId === "CIMA")!.avisos).toContain(
        "Pilar A0: nenhuma viga descarrega nele e ele nasce sobre viga de transição; é só apoio de cálculo, sem carga, e não é calculado como pilar nem descarrega na fundação.",
      );
      // com carga no topo, o mesmo pilar é calculado
      const carregado = cargas(
        transicao({ extra: [{ ...apoio, cargaTopo: { normal: 10, momentos: [] } }] }),
        modo,
      );
      expect(carregado.base["CIMA/A0"]).toBeCloseTo(10 / KN_POR_TF, 4);
    }
  });

  it("concentrada que não cobre a carga de cima (0,5 t de 10 t): a coluna continua nos dois modos", () => {
    // em PB: 10 t da coluna + a reação 0,5·4,1/4 = 0,5125 t (no original, INT(R·100)/100 =
    // 0,51 t, o R5)
    for (const modo of ["original", "corrigido"] as const) {
      const { r, base, avisos } = cargas(transicao({ f: 0.5 }), modo);
      expect(base["BAIXO/PB"]).toBeCloseTo(modo === "original" ? 10.51 : 10.5125, 5);
      expect(base["CIMA/PB"]).toBeUndefined();
      expect(r.falhas).toEqual([]);
      expect(avisos).toContain(
        modo === "original"
          ? "PB: nasce sobre a viga V1 do pavimento BAIXO, que tem 0,50 t de carga concentrada sob ele, e continua a coluna do PB de baixo, deslocado 10 cm, como no .COL do original. Se a concentrada é a carga deste pilar (10,00 t sem o peso próprio), 0,50 t chegam à fundação duas vezes, pela coluna e pela reação da viga."
          : "PB: nasce sobre a viga V1 do pavimento BAIXO, que tem 0,50 t de carga concentrada sob ele, menos que a carga dele (10,00 t sem o peso próprio); a coluna continua a do PB de baixo, deslocado 10 cm. Se a concentrada é parte da carga deste pilar, ela chega à fundação duas vezes, pela coluna e pela reação da viga; confira.",
      );
    }
  });

  it("dentro da folga de 3 %: 9,8 t cobrem os 10 t, e o corrigido parte a coluna", () => {
    const { base } = cargas(transicao({ f: 9.8 }), "corrigido");
    expect(base["CIMA/PB"]).toBeCloseTo(P, 6);
    expect(base["BAIXO/PB"]).toBeCloseTo((9.8 * 4.1) / 4, 6);
  });

  it("pilar de cima com outro nome (não funde): falha se a concentrada não cobre, aviso se cobre", () => {
    for (const modo of ["original", "corrigido"] as const) {
      const pouca = cargas(transicao({ f: 0.5, nome: "PX" }), modo);
      expect(pouca.r.falhas.map((f) => f.texto)).toEqual([
        expect.stringContaining("Pilar PX do pavimento CIMA nasce acima da fundação"),
      ]);
      const toda = cargas(transicao({ nome: "PX" }), modo);
      expect(toda.r.falhas).toEqual([]);
      expect(toda.avisos).toContainEqual(
        expect.stringMatching(/^PX: nasce sobre a viga V1 do pavimento BAIXO, que tem 10,00 t/),
      );
    }
  });

  it("apoio sem carga num pavimento com viga não calculada: continua calculado (a falta de carga pode ser da viga)", () => {
    const apoio: Pilar = { id: "CIMA/A0", nome: "A0", x: 20, y: 20, b: 20, h: 20, transicao: true };
    const inclinada = {
      id: "CIMA/V9",
      nome: "V9",
      x1: 20,
      y1: 20,
      x2: 21,
      y2: 22,
      bw: 20,
      h: 50,
      cargaLinear: 0,
    };
    const { r, base } = cargas(transicao({ extra: [apoio], vigasCima: [inclinada] }), "corrigido");
    expect(base["CIMA/A0"]).toBeCloseTo(0, 6);
    expect(r.pavimentos.find((p) => p.pavimentoId === "CIMA")!.avisos.join(" ")).not.toMatch(
      /só apoio de cálculo/,
    );
  });
});
