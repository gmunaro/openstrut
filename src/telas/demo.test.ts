// Leitura dos parâmetros do link de demonstração (telas/demo.ts).
import { describe, expect, it } from "vitest";
import { lerLinkDemo } from "./demo";

describe("lerLinkDemo", () => {
  it("lê exemplo, aba, explodido, cor, camada e embed", () => {
    expect(
      lerLinkDemo(
        "?exemplo=nbr6118-2023&aba=3d&explodido=1&cor=nkPilares&camada=sequencia&embed=1",
      ),
    ).toEqual({
      embutido: true,
      exemplo: "nbr6118-2023",
      pedido: {
        aba: "3d",
        vista3d: { explodido: true, cor: "nkPilares", camada: "sequencia" },
      },
    });
  });

  it("sem parâmetros: não abre obra, aba planta, nada ligado", () => {
    expect(lerLinkDemo("")).toEqual({
      embutido: false,
      exemplo: null,
      pedido: { aba: "planta", vista3d: { explodido: false, cor: null, camada: null } },
    });
  });

  it("valor fora da lista vale o padrão", () => {
    const l = lerLinkDemo("?exemplo=nbr6118-2014&aba=memoria&cor=vermelho&explodido=0&embed=false");
    expect(l.exemplo).toBeNull();
    expect(l.embutido).toBe(false);
    expect(l.pedido).toEqual({
      aba: "planta",
      vista3d: { explodido: false, cor: null, camada: null },
    });
  });

  it("aceita valores entre aspas, como o router serializa strings", () => {
    const l = lerLinkDemo('?exemplo="nb1-78"&aba="resultados"&embed');
    expect(l.exemplo).toBe("nb1-78");
    expect(l.pedido.aba).toBe("resultados");
    // `embed` sem valor liga o modo
    expect(l.embutido).toBe(true);
  });
});
