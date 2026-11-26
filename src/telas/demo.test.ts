// Leitura dos parâmetros do link de demonstração (telas/demo.ts) e o foco por nome.
import { describe, expect, it } from "vitest";
import { obraEdificio } from "../dominio/edificio";
import { acharFoco, lerLinkDemo } from "./demo";

/** A vista 3D sem nada pedido. */
const VISTA_PADRAO = {
  explodido: false,
  cor: null,
  rampa: null,
  camadas: [],
  opcoes: { tracado: false, reproduzir: false },
  vista: null,
  painel: true,
};

describe("lerLinkDemo", () => {
  it("lê exemplo, aba, explodido, cor, camada e embed", () => {
    expect(
      lerLinkDemo(
        "?exemplo=nbr6118-2023&aba=3d&explodido=1&cor=nkPilares&rampa=calor&camada=sequencia&embed=1",
      ),
    ).toEqual({
      embutido: true,
      exemplo: "nbr6118-2023",
      pedido: {
        aba: "3d",
        vista3d: {
          ...VISTA_PADRAO,
          explodido: true,
          cor: "nkPilares",
          rampa: "calor",
          camadas: ["sequencia"],
        },
        foco: null,
        moldura: true,
      },
    });
  });

  it("lê o edifício, várias camadas, as opções delas, foco, câmera e painel", () => {
    const l = lerLinkDemo(
      "?exemplo=edificio&aba=3d&camada=render,sequencia,render&tracado=1&reproduzir=1" +
        "&foco=pilar~1%C2%BA%20pavimento~P6&vista=frente&painel=0&moldura=0",
    );
    expect(l.exemplo).toBe("edificio");
    expect(l.pedido.vista3d).toEqual({
      ...VISTA_PADRAO,
      camadas: ["render", "sequencia"],
      opcoes: { tracado: true, reproduzir: true },
      vista: "frente",
      painel: false,
    });
    expect(l.pedido.foco).toEqual({ tipo: "pilar", pavimento: "1º pavimento", nome: "P6" });
    expect(l.pedido.moldura).toBe(false);
  });

  it("sem parâmetros: não abre obra, aba planta, nada ligado", () => {
    expect(lerLinkDemo("")).toEqual({
      embutido: false,
      exemplo: null,
      pedido: { aba: "planta", vista3d: VISTA_PADRAO, foco: null, moldura: true },
    });
  });

  it("valor fora da lista vale o padrão", () => {
    const l = lerLinkDemo(
      "?exemplo=nbr6118-2014&aba=memoria&cor=vermelho&explodido=0&embed=false" +
        "&vista=isometrica&foco=coluna~Tipo~P1&painel=1",
    );
    expect(l.exemplo).toBeNull();
    expect(l.embutido).toBe(false);
    expect(l.pedido).toEqual({ aba: "planta", vista3d: VISTA_PADRAO, foco: null, moldura: true });
  });

  it("aceita valores entre aspas, como o router serializa strings", () => {
    const l = lerLinkDemo('?exemplo="nb1-78"&aba="resultados"&embed');
    expect(l.exemplo).toBe("nb1-78");
    expect(l.pedido.aba).toBe("resultados");
    // `embed` sem valor liga o modo
    expect(l.embutido).toBe(true);
  });
});

describe("acharFoco", () => {
  const obra = obraEdificio();
  const primeiro = obra.pavimentos.find((p) => p.nome === "1º pavimento");

  it("acha o elemento pelo tipo, pavimento e nome", () => {
    const p6 = primeiro?.pilares.find((p) => p.nome === "P6");
    expect(acharFoco(obra, { tipo: "pilar", pavimento: "1º pavimento", nome: "P6" })).toEqual({
      tipo: "pilar",
      pavimentoId: primeiro?.id,
      id: p6?.id,
    });
  });

  it("pavimento ou nome inexistente: nenhum foco", () => {
    expect(acharFoco(obra, { tipo: "pilar", pavimento: "Subsolo", nome: "P6" })).toBeNull();
    expect(acharFoco(obra, { tipo: "viga", pavimento: "Tipo", nome: "V99" })).toBeNull();
    expect(acharFoco(obra, null)).toBeNull();
  });
});
