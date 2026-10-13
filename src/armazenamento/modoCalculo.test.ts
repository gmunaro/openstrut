// Item A (docs/MODO-CALCULO.md): o campo Obra.modoCalculo no arquivo. Obra nova é
// "corrigido"; arquivo sem o campo (anterior ao switch) lê como "corrigido".
import { describe, expect, it } from "vitest";
import { obraNova } from "../dominio/criar";
import { lerObra, serializarObra } from "./arquivo";

describe("modo de cálculo no arquivo da obra", () => {
  it('obra nova vem em "corrigido"', () => {
    expect(obraNova("X", "nb1-78").modoCalculo).toBe("corrigido");
  });

  it('arquivo sem o campo lê como "corrigido"', () => {
    const { modoCalculo: _modo, ...antiga } = obraNova("X", "nb1-78");
    const r = lerObra(JSON.stringify(antiga));
    expect(r.ok && r.obra.modoCalculo).toBe("corrigido");
  });

  it('"original" sobrevive à gravação e leitura', () => {
    const r = lerObra(serializarObra({ ...obraNova("X", "nb1-78"), modoCalculo: "original" }));
    expect(r.ok && r.obra.modoCalculo).toBe("original");
  });

  it("valor desconhecido é erro com o caminho", () => {
    const r = lerObra(JSON.stringify({ ...obraNova("X", "nb1-78"), modoCalculo: "1991" }));
    expect(r.ok ? [] : r.erros).toEqual([
      'obra.modoCalculo: esperado um de "corrigido", "original", veio "1991".',
    ]);
  });
});
