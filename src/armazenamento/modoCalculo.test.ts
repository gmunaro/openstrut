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

describe("campos opcionais do caminho do SISTRUT no arquivo", () => {
  const comViga = () => {
    const o = obraNova("X", "nb1-78");
    const pav = o.pavimentos[0]!;
    const viga = { id: "v", nome: "V1", x1: 0, y1: 0, x2: 4, y2: 0, bw: 12, h: 40, cargaLinear: 0 };
    return { ...o, pavimentos: [{ ...pav, vigas: [viga] }] };
  };

  it("sem os campos: viga sem peso digitado e obra sem a flag (o motor roda a otimização)", () => {
    const r = lerObra(serializarObra(comViga()));
    expect(r.ok && r.obra.otimizaNegativos).toBeUndefined();
    expect(r.ok && r.obra.pavimentos[0]!.vigas[0]!.pesoProprio).toBeUndefined();
  });

  it("peso próprio digitado da viga e otimizaNegativos = false sobrevivem à ida e volta", () => {
    const o = comViga();
    const pav = o.pavimentos[0]!;
    const obra = {
      ...o,
      otimizaNegativos: false,
      pavimentos: [{ ...pav, vigas: [{ ...pav.vigas[0]!, pesoProprio: 1.471 }] }],
    };
    const r = lerObra(serializarObra(obra));
    expect(r.ok && r.obra.otimizaNegativos).toBe(false);
    expect(r.ok && r.obra.pavimentos[0]!.vigas[0]!.pesoProprio).toBe(1.471);
  });

  it("flag que não é booleana é erro com o caminho", () => {
    const r = lerObra(JSON.stringify({ ...obraNova("X", "nb1-78"), otimizaNegativos: "sim" }));
    expect(r.ok ? [] : r.erros).toEqual([
      'obra.otimizaNegativos: esperado verdadeiro ou falso, veio "sim".',
    ]);
  });
});
