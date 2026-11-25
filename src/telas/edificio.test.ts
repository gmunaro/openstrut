// Edifício de demonstração (dominio/edificio.ts): a estrutura esperada pela geometria da
// planta e o cálculo pela NBR 6118:2023 sem falha em nenhuma peça.
import { describe, expect, it } from "vitest";
import { NOME_EDIFICIO, obraEdificio } from "../dominio/edificio";
import { diagnosticos } from "../planta/situacao";
import { calcular, coletarFalhas } from "./calculo";

describe("obraEdificio", () => {
  const obra = obraEdificio();

  it("empilha casa de máquinas, cobertura, tipo × 6 e 1º pavimento: 9 níveis", () => {
    expect(obra.nome).toBe(NOME_EDIFICIO);
    expect(obra.pavimentos.map((p) => [p.nome, p.repeticoes])).toEqual([
      ["Casa de máquinas", 1],
      ["Cobertura", 1],
      ["Tipo", 6],
      ["1º pavimento", 1],
    ]);
    expect(obra.pavimentos.reduce((n, p) => n + p.repeticoes, 0)).toBe(9);
  });

  it("andar-tipo em L: 11 lajes na grade, 2 varandas em balanço, 9 vigas e 19 pilares", () => {
    const tipo = obra.pavimentos.find((p) => p.nome === "Tipo");
    // grade 4 × 3 sem o canto de cima à direita
    const varandas = tipo?.lajes.filter((l) => l.vinculos.inferior === "livre") ?? [];
    expect(tipo?.lajes).toHaveLength(13);
    expect(varandas.map((l) => [l.y, l.ly, l.vinculos.superior])).toEqual([
      [-1.4, 1.4, "engastado"],
      [-1.4, 1.4, "engastado"],
    ]);
    // vigas: horizontais em y = 0; 5,2; 7,6; 12,8 e verticais em x = 0; 4,6; 9,2; 12,8; 17,4
    expect(tipo?.vigas).toHaveLength(9);
    // nós da grade 5 × 4 menos o canto (17,4; 12,8) que a planta em L não tem
    expect(tipo?.pilares).toHaveLength(19);
  });

  it("a seção dos pilares muda com a posição na planta e com o pavimento", () => {
    const secoes = (nome: string) =>
      new Set(obra.pavimentos.find((p) => p.nome === nome)?.pilares.map((p) => `${p.b}x${p.h}`));
    // canto, borda (nas duas direções) e interior
    expect(secoes("1º pavimento")).toEqual(new Set(["35x50", "25x60", "60x25", "30x70"]));
    expect(secoes("Tipo")).toEqual(new Set(["30x45", "25x45", "45x25", "25x60"]));
    // a casa de máquinas continua os pilares da cobertura, com a mesma seção
    const cobertura = obra.pavimentos.find((p) => p.nome === "Cobertura");
    for (const p of obra.pavimentos[0]?.pilares ?? []) {
      const q = cobertura?.pilares.find((c) => c.x === p.x && c.y === p.y);
      expect([p.b, p.h]).toEqual([q?.b, q?.h]);
    }
  });

  it("a casa de máquinas pesa na cobertura: piso de 7,5 kN/m² e paredes no contorno", () => {
    const cobertura = obra.pavimentos.find((p) => p.nome === "Cobertura");
    // piso da casa: as duas lajes do meio (x 4,6 a 9,2), sobre o corredor e o hall
    expect(cobertura?.lajes.filter((l) => l.sobrecarga === 7.5).map((l) => [l.x, l.y])).toEqual([
      [4.6, 5.2],
      [4.6, 7.6],
    ]);
    // vigas em x = 4,6 e 9,2 e em y = 5,2 e 12,8: platibanda 2 + paredes da casa 4,3 kN/m
    const eixo = (v: { x1: number; x2: number; y1: number }) =>
      v.x1 === v.x2 ? `x=${v.x1}` : `y=${v.y1}`;
    const comCasa = cobertura?.vigas.filter((v) => v.cargaLinear === 6.3).map(eixo);
    expect(comCasa?.toSorted()).toEqual(["x=4.6", "x=9.2", "y=12.8", "y=5.2"]);
    expect(cobertura?.vigas.filter((v) => v.cargaLinear === 2)).toHaveLength(5);
  });

  it("calcula pela NBR 6118:2023 sem falha, com todas as peças sem aviso", () => {
    const c = calcular(obra);
    expect(c.tipo).toBe("ok");
    if (c.tipo !== "ok") return;
    expect(coletarFalhas(c.resultado)).toEqual([]);
    // um lance por pilar e por repetição: 6 + 19 + 19 × 6 + 19
    expect(c.resultado.pilares).toHaveLength(158);
    const situacoes = c.resultado.pavimentos.flatMap((r) => {
      const d = diagnosticos(r, c.resultado.pilares);
      return [...d.lajes.values(), ...d.vigas.values(), ...(d.pilares?.values() ?? [])].map(
        (x) => x.situacao,
      );
    });
    expect(new Set(situacoes)).toEqual(new Set(["ok"]));
  });
});
