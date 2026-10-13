import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Obra } from "../dominio/obra";
import { nomeArquivoSugerido } from "./arquivoLocal";
import { calcular, coletarAvisos, coletarFalhas, mensagemSemNorma, rotuloNivel } from "./calculo";

/** Duas lajes lado a lado num pavimento-tipo repetido 2 vezes. */
function obraDuasLajes(norma: Obra["norma"]): Obra {
  const obra = obraNova("Duas lajes", norma);
  let pav = { ...obra.pavimentos[0]!, nome: "Tipo", repeticoes: 2 };
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 });
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(pav, { x: 4, y: 0, lx: 3.5, ly: 5 });
  return { ...obra, pavimentos: [gerarEstrutura({ ...pav, lajes: [l1, l2] })] };
}

describe("calcular (ponte tela → motor)", () => {
  it("NBR 6118:2023 calcula a obra, com equilíbrio ok", () => {
    const c = calcular(obraDuasLajes("nbr6118-2023"));
    expect(c.tipo).toBe("ok");
    if (c.tipo !== "ok") return;
    expect(c.resultado.norma.id).toBe("nbr6118-2023");
    expect(c.resultado.pavimentos[0]!.equilibrio.ok).toBe(true);
  });

  it("mensagem para norma sem implementação continua clara", () => {
    expect(mensagemSemNorma("nbr6118-2023")).toMatch(/NBR 6118:2023 ainda não disponível/);
  });

  it("NB-1/78 calcula a obra e os níveis dos pilares levam (k/n)", () => {
    const c = calcular(obraDuasLajes("nb1-78"));
    expect(c.tipo).toBe("ok");
    if (c.tipo !== "ok") return;
    expect(c.resultado.pavimentos).toHaveLength(1);
    expect(c.resultado.pavimentos[0]!.lajes).toHaveLength(2);
    const niveis = new Set(c.resultado.pilares.map((p) => rotuloNivel(c.resultado, p)));
    expect([...niveis]).toEqual(["Tipo (1/2)", "Tipo (2/2)"]);
  });
});

describe("coletarAvisos", () => {
  it("junta os avisos de obra, lajes, montagem, vigas, equilíbrio e pilares sem filtrar", () => {
    const c = calcular(obraDuasLajes("nb1-78"));
    if (c.tipo !== "ok") throw new Error("esperado cálculo ok");
    const r = c.resultado;
    const esperado =
      r.avisos.length +
      r.pavimentos.reduce(
        (s, p) =>
          s +
          p.lajes.reduce((t, l) => t + l.esforcos.avisos.length + l.armadura.avisos.length, 0) +
          p.montagem.avisos.length +
          p.montagem.naoCalculadas.length +
          p.vigas.reduce((t, v) => t + new Set([...v.analise.avisos, ...v.avisos]).size, 0) +
          p.equilibrio.avisos.length,
        0,
      ) +
      r.pilares.reduce((s, p) => s + p.resultado.avisos.length, 0);
    expect(coletarAvisos(r)).toHaveLength(esperado);
  });

  it("aviso de pilar sai com o nível e o nome do pilar", () => {
    const c = calcular(obraDuasLajes("nb1-78"));
    if (c.tipo !== "ok") throw new Error("esperado cálculo ok");
    const p = c.resultado.pilares[0]!;
    const r = {
      ...c.resultado,
      avisos: [],
      pavimentos: [],
      pilares: [{ ...p, resultado: { ...p.resultado, avisos: ["λ > 90"] } }],
    };
    expect(coletarAvisos(r)).toEqual([{ local: "Tipo", elemento: p.pilar.nome, texto: "λ > 90" }]);
  });
});

describe("nomeArquivoSugerido", () => {
  it("tira caracteres proibidos no Windows e põe a extensão", () => {
    expect(nomeArquivoSugerido("Casa: A/B")).toBe("Casa AB.sistrut.json");
    expect(nomeArquivoSugerido("  ")).toBe("obra.sistrut.json");
    expect(nomeArquivoSugerido("Residência   Silva")).toBe("Residência Silva.sistrut.json");
  });
});

describe("rotuloNivel e coletarFalhas", () => {
  it("casa o pavimento pelo id: dois com o mesmo nome, só um repetido", () => {
    const base = obraDuasLajes("nb1-78");
    const pav = base.pavimentos[0]!;
    const c = calcular({
      ...base,
      pavimentos: [
        { ...pav, id: "cima", repeticoes: 1 },
        { ...pav, id: "baixo", repeticoes: 2 },
      ],
    });
    if (c.tipo !== "ok") throw new Error("esperado cálculo ok");
    const rotulos = (id: string) =>
      new Set(
        c.resultado.pilares
          .filter((p) => p.pavimentoId === id)
          .map((p) => rotuloNivel(c.resultado, p)),
      );
    expect([...rotulos("cima")]).toEqual(["Tipo"]);
    expect([...rotulos("baixo")]).toEqual(["Tipo (1/2)", "Tipo (2/2)"]);
  });

  it("coletarFalhas traz as falhas dos pavimentos com o nome do pavimento", () => {
    const c = calcular(obraDuasLajes("nb1-78"));
    if (c.tipo !== "ok") throw new Error("esperado cálculo ok");
    expect(coletarFalhas(c.resultado)).toEqual([]);
    const [rp] = c.resultado.pavimentos;
    const r = { ...c.resultado, pavimentos: [{ ...rp!, falhas: ["carga perdida"] }] };
    expect(coletarFalhas(r)).toEqual([{ local: "Tipo", elemento: "", texto: "carga perdida" }]);
  });
});
