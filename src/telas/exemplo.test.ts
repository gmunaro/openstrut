// Obra-exemplo da tela inicial: a planta tem a estrutura esperada pela geometria e a obra
// calcula pelas duas normas sem falha de pavimento (carga que não chega a vigas ou pilares).
import { describe, expect, it } from "vitest";
import { NOME_EXEMPLO, obraExemplo } from "../dominio/exemplo";
import { calcular, coletarFalhas } from "./calculo";

describe("obraExemplo", () => {
  it("monta dois pavimentos com 5 lajes, 7 vigas e 11 pilares cada", () => {
    const obra = obraExemplo();
    expect(obra.nome).toBe(NOME_EXEMPLO);
    expect(obra.pavimentos.map((p) => p.nome)).toEqual(["Cobertura", "Piso superior"]);
    for (const p of obra.pavimentos) {
      expect(p.lajes.map((l) => l.nome)).toEqual(["L1", "L2", "L3", "L4", "L5"]);
      // vigas: 3 horizontais (y = 0; 4,5; 9) e 4 verticais (x = 0; 4; 8; 10,5)
      expect(p.vigas).toHaveLength(7);
      // pilares nos nós: 4 em y = 0, 4 em y = 4,5 e 3 em y = 9
      expect(p.pilares).toHaveLength(11);
      expect(p.pilares.every((q) => q.b === 25 && q.h === 25)).toBe(true);
    }
  });

  it.each(["nb1-78", "nbr6118-2023"] as const)("calcula pela %s sem falha", (norma) => {
    const obra = obraExemplo(norma);
    expect(obra.norma).toBe(norma);
    const c = calcular(obra);
    expect(c.tipo).toBe("ok");
    if (c.tipo !== "ok") return;
    expect(coletarFalhas(c.resultado)).toEqual([]);
    expect(c.resultado.pilares.length).toBe(22);
  });

  it("gera ids novos a cada chamada (duas cópias abertas não se confundem)", () => {
    const a = obraExemplo();
    const b = obraExemplo();
    expect(a.pavimentos[0]?.id).not.toBe(b.pavimentos[0]?.id);
  });
});
