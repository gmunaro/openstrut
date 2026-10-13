// Situação dos elementos para a cor na planta. Parte de uma obra calculada de
// verdade (NB-1/78) e troca só o campo que define a situação.
import { describe, expect, it } from "vitest";
import { calcularObra } from "../calculo/fluxo";
import { nb178 } from "../calculo/normas";
import { lajeNova, obraNova, pavimentoNovo } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import {
  diagnosticoLaje,
  diagnosticoPilar,
  diagnosticosPilares,
  diagnosticoViga,
  diagnosticos,
} from "./situacao";

function calculado() {
  const obra = obraNova("T", "nb1-78");
  const pav = obra.pavimentos[0]!;
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 });
  const comLaje = { ...pav, lajes: [l1] };
  const l2 = lajeNova(comLaje, { x: 4, y: 0, lx: 3.5, ly: 5 });
  obra.pavimentos[0] = gerarEstrutura({ ...pav, lajes: [l1, l2] });
  return calcularObra(obra, nb178).pavimentos[0]!;
}

describe("situação", () => {
  const rp = calculado();

  it("laje calculada sem avisos é ok; com aviso é aviso; As infinito é falha", () => {
    const r = rp.lajes[0]!;
    const semAvisos = {
      ...r,
      esforcos: { ...r.esforcos, avisos: [] },
      armadura: { ...r.armadura, avisos: [] },
    };
    expect(diagnosticoLaje(semAvisos).situacao).toBe("ok");
    const comAviso = { ...semAvisos, armadura: { ...semAvisos.armadura, avisos: ["flecha"] } };
    expect(diagnosticoLaje(comAviso)).toEqual({ situacao: "aviso", mensagens: ["flecha"] });
    const impossivel = { ...semAvisos, armadura: { ...semAvisos.armadura, asx: Infinity } };
    expect(diagnosticoLaje(impossivel).situacao).toBe("falha");
  });

  it("viga: ok, aviso, e falha quando a análise não fecha", () => {
    const v = rp.vigas[0]!;
    expect(diagnosticoViga({ ...v, avisos: [] }).situacao).toBe("ok");
    expect(diagnosticoViga({ ...v, avisos: ["x/d alto"] }).situacao).toBe("aviso");
    const instavel = { ...v, analise: { ok: false as const, avisos: ["instável"], memoria: [] } };
    expect(diagnosticoViga({ ...instavel, avisos: ["instável"] })).toEqual({
      situacao: "falha",
      mensagens: ["Análise não realizada.", "instável"],
    });
  });

  it("viga: aviso da análise (ligação viga-pilar) também deixa a viga em aviso", () => {
    const v = rp.vigas[0]!;
    if (!v.analise.ok) throw new Error("viga sem análise");
    const lig = "Viga V1: pilar P1 sem dados de lance; ligação de extremidade tratada como rótula.";
    const comAviso = { ...v, avisos: [], analise: { ...v.analise, avisos: [lig] } };
    expect(diagnosticoViga(comAviso)).toEqual({ situacao: "aviso", mensagens: [lig] });
    // o mesmo aviso nas duas listas aparece uma vez
    expect(diagnosticoViga({ ...comAviso, avisos: [lig] }).mensagens).toEqual([lig]);
  });

  it("mapas por id cobrem todas as lajes e vigas calculadas", () => {
    const d = diagnosticos(rp);
    expect(d.lajes.size).toBe(2);
    expect(d.vigas.size).toBe(rp.vigas.length);
    expect(d.lajes.has(rp.pavimento.lajes[0]!.id)).toBe(true);
  });
});

describe("situação dos pilares", () => {
  // Tipo (2 repetições) sobre Térreo, mesma planta com ids diferentes
  const obra = obraNova("T", "nb1-78");
  const base = obra.pavimentos[0]!;
  const l1 = lajeNova(base, { x: 0, y: 0, lx: 4, ly: 5 });
  const l2 = lajeNova({ ...base, lajes: [l1] }, { x: 4, y: 0, lx: 3.5, ly: 5 });
  const tipo = { ...gerarEstrutura({ ...base, lajes: [l1, l2] }), nome: "Tipo", repeticoes: 2 };
  const terreo = { ...gerarEstrutura({ ...pavimentoNovo("Térreo"), lajes: [l1, l2] }) };
  terreo.lajes = terreo.lajes.map((l) => ({ ...l, id: `${l.id}-t` }));
  const r = calcularObra({ ...obra, pavimentos: [tipo, terreo] }, nb178);
  const p1 = r.pilares.find((p) => p.pavimento === "Tipo" && p.repeticao === 1)!;
  const comAvisos = (avisos: string[], asNecessaria = p1.resultado.asNecessaria) => ({
    ...p1,
    resultado: { ...p1.resultado, avisos, asNecessaria },
  });

  it("ok sem avisos; outros avisos = aviso; seção insuficiente ou As NaN = falha", () => {
    expect(diagnosticoPilar(comAvisos([])).situacao).toBe("ok");
    expect(diagnosticoPilar(comAvisos(["P1: φ 16 mm > b/8"]))).toEqual({
      situacao: "aviso",
      mensagens: ["P1: φ 16 mm > b/8"],
    });
    // textos das normas (nb1-78/pilares.ts, nbr6118-2023/pilares.ts)
    for (const a of [
      "P1: armadura excede o máximo (6%), aumente a seção",
      "P1: menor dimensão 12 cm < 14 cm, não permitida (13.2.3)",
      "P1: barras não cabem (mais de 20)",
    ])
      expect(diagnosticoPilar(comAvisos(["outro", a])).mensagens[0]).toBe(a);
    expect(diagnosticoPilar(comAvisos(["P1: λ = 95 > 90"], NaN))).toEqual({
      situacao: "falha",
      mensagens: ["P1: λ = 95 > 90"],
    });
    expect(diagnosticoPilar(comAvisos([], NaN)).situacao).toBe("falha");
  });

  it("casa os pilares pela posição e fica com a pior situação entre os níveis", () => {
    const limpos = r.pilares.map((p) => ({ ...p, resultado: { ...p.resultado, avisos: [] } }));
    const d = diagnosticosPilares(tipo, limpos);
    expect(d.size).toBe(tipo.pilares.length);
    expect([...d.keys()].sort()).toEqual(tipo.pilares.map((p) => p.id).sort());
    expect(diagnosticosPilares(terreo, limpos).size).toBe(terreo.pilares.length);
    // o mesmo pilar: aviso na repetição 1, falha na 2 → falha, com o nível nas mensagens
    const alvo = tipo.pilares.find((p) => p.x === p1.pilar.x && p.y === p1.pilar.y)!;
    const piorado = limpos.map((p) =>
      p.pilar.x !== alvo.x || p.pilar.y !== alvo.y || p.pavimento !== "Tipo"
        ? p
        : {
            ...p,
            resultado: {
              ...p.resultado,
              avisos: [
                p.repeticao === 1 ? "aviso leve" : "armadura excede o máximo, aumente a seção",
              ],
            },
          },
    );
    expect(diagnosticosPilares(tipo, piorado).get(alvo.id)).toEqual({
      situacao: "falha",
      mensagens: [
        "Tipo (1/2): aviso leve",
        "Tipo (2/2): armadura excede o máximo, aumente a seção",
      ],
    });
  });

  it("diagnosticos só colore pilares quando recebe os resultados deles", () => {
    const rp = r.pavimentos[0]!;
    expect(diagnosticos(rp).pilares).toBeUndefined();
    expect(diagnosticos(rp, r.pilares).pilares?.size).toBe(tipo.pilares.length);
  });
});

describe("situação: pavimentos com o mesmo nome e falhas", () => {
  // dois pavimentos "Tipo" (ids diferentes), o de cima com pilares 20 × 20
  const obra = obraNova("T", "nb1-78");
  const base = obra.pavimentos[0]!;
  const l1 = lajeNova(base, { x: 0, y: 0, lx: 4, ly: 5 });
  const l2 = lajeNova({ ...base, lajes: [l1] }, { x: 4, y: 0, lx: 3.5, ly: 5 });
  const baixo = { ...gerarEstrutura({ ...base, lajes: [l1, l2] }), nome: "Tipo" };
  const cima = {
    ...baixo,
    id: "cima",
    pilares: baixo.pilares.map((p) => ({ ...p, id: `${p.id}-c`, b: 20, h: 20 })),
  };
  const r = calcularObra({ ...obra, pavimentos: [cima, baixo] }, nb178);
  const limpos = r.pilares.map((p) => ({ ...p, resultado: { ...p.resultado, avisos: [] } }));

  it("casa o nível pelo id do pavimento, não pelo nome", () => {
    // só o de baixo com aviso: o de cima tem de ficar ok
    const marcados = limpos.map((p) =>
      p.pavimentoId === baixo.id
        ? { ...p, resultado: { ...p.resultado, avisos: ["só embaixo"] } }
        : p,
    );
    const dc = diagnosticosPilares(cima, marcados);
    const db = diagnosticosPilares(baixo, marcados);
    expect(dc.size).toBe(cima.pilares.length);
    expect([...dc.values()].every((d) => d.situacao === "ok")).toBe(true);
    expect([...db.values()].every((d) => d.situacao === "aviso")).toBe(true);
  });

  it("ResultadoPilar.falhas e ResultadoPavimento.falhas pintam de falha", () => {
    const p = limpos[0]!;
    expect(diagnosticoPilar({ ...p, falhas: ["carga perdida"] })).toEqual({
      situacao: "falha",
      mensagens: ["carga perdida"],
    });
    const rp = r.pavimentos[0]!;
    const v = { ...rp.vigas[0]!, avisos: [] };
    expect(diagnosticoViga(v, ["Laje L9 sem cálculo"])).toEqual({
      situacao: "falha",
      mensagens: ["Laje L9 sem cálculo"],
    });
    const d = diagnosticos({ ...rp, vigas: [v], falhas: ["Laje L9 sem cálculo"] });
    expect(d.vigas.get(v.viga.id)?.situacao).toBe("falha");
  });

  it("laje sem reação nenhuma (sem cálculo) é falha", () => {
    const l = r.pavimentos[0]!.lajes[0]!;
    const zeradas = { superior: 0, inferior: 0, esquerdo: 0, direito: 0 };
    const semCalculo = {
      ...l,
      esforcos: { ...l.esforcos, avisos: [], reacoes: zeradas },
      armadura: { ...l.armadura, avisos: [] },
    };
    expect(diagnosticoLaje(semCalculo).situacao).toBe("falha");
  });
});
