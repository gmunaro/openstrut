// Exportação IFC: escritor STEP, níveis, geometria e propriedades do modelo, e o arquivo
// escrito. Os valores esperados vêm da obra (pés-direitos, seções, cobrimentos) e do
// detalhamento conferido à mão; a leitura do arquivo por um leitor IFC de verdade está
// em ifc.ifcopenshell.test.ts.
import { describe, expect, it } from "vitest";
import type { Obra, Pilar } from "../../dominio/obra";
import { importarObraSistrut } from "../../telas/InicioSistrut";
import { OBRA_E2E, PREDIO } from "../../telas/__fixtures__/predioSistrut";
import { calcular } from "../../telas/calculo";
import { detalharObra } from "../../telas/detalhamento";
import { obraComEscada, obraTresPavimentos } from "./__fixtures__/obras";
import { gerarIfc } from "./exportarIfc";
import {
  type CalculoIfc,
  modeloIfc,
  niveisDaObra,
  pavimentoDeVigasAvulsas,
  type PilarIfc,
  trechosDaViga,
  type VigaIfc,
} from "./modelo";
import { perfilPilar } from "../../dominio/armaduraGeometria";
import { deduzirApoiosEscada } from "./escada";
import { globalId, numeroStep, textoStep } from "./step";

const DATA = new Date("2026-10-17T12:00:00Z");

function calculado(obra: Obra): CalculoIfc {
  const c = calcular(obra);
  if (c.tipo !== "ok") throw new Error(`cálculo: ${c.tipo}`);
  return { resultado: c.resultado, detalhamento: detalharObra(c.resultado, obra) };
}

function importada(arquivos: Parameters<typeof importarObraSistrut>[0]) {
  const r = importarObraSistrut(arquivos);
  if (!r.ok) throw new Error(r.erros.join(" "));
  return r.obra;
}

describe("STEP", () => {
  it("REAL sempre com ponto, sem expoente nem -0", () => {
    expect(numeroStep(3)).toBe("3.");
    expect(numeroStep(-0)).toBe("0.");
    expect(numeroStep(0.1 + 0.2)).toBe("0.3");
    expect(numeroStep(1e-7)).toBe("0.0000001");
    expect(numeroStep(-2.5)).toBe("-2.5");
  });

  it("texto: apóstrofo e barra dobrados, fora do ASCII em \\X2\\", () => {
    expect(textoStep("P'1\\a")).toBe("'P''1\\\\a'");
    expect(textoStep("Fundação")).toBe("'Funda\\X2\\00E700E3\\X0\\o'");
    expect(textoStep("φ10")).toBe("'\\X2\\03C6\\X0\\10'");
  });

  it("GlobalId: 22 caracteres do alfabeto do IFC, estável e diferente por chave", () => {
    const a = globalId("obra|P1");
    expect(a).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(globalId("obra|P1")).toBe(a);
    expect(globalId("obra|P2")).not.toBe(a);
  });
});

describe("níveis", () => {
  it("fundação em 0 e um por repetição, na soma dos pés-direitos; repetição 1 no topo", () => {
    // Térreo 3,2; Tipo 2,8 × 2; Cobertura 3,0 (fixture)
    const n = niveisDaObra(obraTresPavimentos());
    expect(n.map((x) => x.nome)).toEqual([
      "Fundação",
      "Térreo",
      "Tipo (2/2)",
      "Tipo (1/2)",
      "Cobertura",
    ]);
    const elevacoes = n.map((x) => x.elevacao);
    [0, 3.2, 6.0, 8.8, 11.8].forEach((z, i) => expect(elevacoes[i]).toBeCloseTo(z, 9));
  });
});

describe("modelo da obra de 3 pavimentos", () => {
  const obra = obraTresPavimentos();
  const semCalculo = modeloIfc(obra, null);
  const porTipo = (t: string) => semCalculo.elementos.filter((e) => e.tipo === t);

  it("cada nível leva os elementos do pavimento dele", () => {
    // 2 lajes geram 6 pilares e 5 vigas por pavimento; 4 níveis com elementos
    expect(porTipo("pilar")).toHaveLength(24);
    expect(porTipo("viga")).toHaveLength(20);
    expect(porTipo("laje")).toHaveLength(8);
    expect(semCalculo.elementos.every((e) => e.armadura.length === 0)).toBe(true);
  });

  it("pilar: o lance abaixo do nível, no storey da base, que sobe o pé-direito", () => {
    // pilar do Tipo (1/2) (nível em 8,8 m, pé-direito 2,8): base no Tipo (2/2), em 6,0 m
    const p = porTipo("pilar").find((e) => e.propriedades.NivelTopo === "Tipo (1/2)") as PilarIfc;
    expect(p.nivel.nome).toBe("Tipo (2/2)");
    expect(p.nivel.elevacao).toBeCloseTo(6.0, 9);
    expect(p.base).toBe(0);
    expect(p.altura).toBeCloseTo(2.8, 9);
    expect(p.propriedades).toMatchObject({ Pavimento: "Tipo", NivelBase: "Tipo (2/2)" });
    expect(p.perfil).toEqual({ tipo: "retangulo", largura: 0.2, altura: 0.2 });
    // os do Térreo nascem na fundação; vigas e lajes ficam no nível do pavimento
    const doTerreo = porTipo("pilar").filter((e) => e.propriedades.Pavimento === "Térreo");
    expect(doTerreo.every((e) => e.nivel.nome === "Fundação")).toBe(true);
    expect(porTipo("viga").every((e) => e.nivel.nome !== "Fundação")).toBe(true);
  });

  it("viga: eixo da planta e seção bw × h; laje: polígono com h", () => {
    const pav = obra.pavimentos[0]!;
    const v = pav.vigas[0]!;
    const vi = porTipo("viga").find(
      (e) => e.nivel.nome === "Cobertura" && e.nome === v.nome,
    ) as VigaIfc;
    expect(vi.comprimento).toBeCloseTo(Math.hypot(v.x2 - v.x1, v.y2 - v.y1), 9);
    expect(vi.trechos).toEqual([
      {
        inicio: 0,
        fim: vi.comprimento,
        perfil: { tipo: "retangulo", largura: v.bw / 100, altura: v.h / 100 },
      },
    ]);
    const l = porTipo("laje")[0]!;
    expect(l.tipo === "laje" && l.espessura).toBeCloseTo(0.12, 9);
  });

  it("com cálculo: resultados no Pset e barras em vigas e pilares", () => {
    const m = modeloIfc(obra, calculado(obra));
    const p = m.elementos.find((e) => e.tipo === "pilar" && e.propriedades.NivelTopo === "Térreo")!;
    expect(p.propriedades.Nk_kN).toBeGreaterThan(0);
    expect(p.propriedades.Armadura).toMatch(/^\d+ φ/);
    expect(p.armadura.map((x) => x.nome)).toEqual(["Longitudinal", "Estribo"]);
    const v = m.elementos.find((e) => e.tipo === "viga" && e.nivel.nome === "Térreo")!;
    expect(v.propriedades.AsPositiva_cm2).toBeGreaterThan(0);
    expect(v.armadura.some((x) => x.tipo === "estribo")).toBe(true);
    expect(v.armadura.some((x) => x.tipo === "positiva")).toBe(true);
    const l = m.elementos.find((e) => e.tipo === "laje")!;
    expect(l.propriedades.FlechaLimite_cm).toBeGreaterThan(0);
    // sem armadura quando pedido
    const sem = modeloIfc(obra, calculado(obra), { armadura: false });
    expect(sem.elementos.every((e) => e.armadura.length === 0)).toBe(true);
  });

  it("barras do pilar 20 × 20: na face menos cobrimento, estribo e φ/2", () => {
    const m = modeloIfc(obra, calculado(obra));
    const p = m.elementos.find((e) => e.tipo === "pilar" && e.propriedades.NivelTopo === "Térreo")!;
    const longitudinal = p.armadura[0]!;
    // 0,10 − 0,03 (cobrimento) − φt − φ/2
    const phiT = p.armadura[1]!.phi / 1000;
    const a = 0.1 - 0.03 - phiT - longitudinal.phi / 2000;
    const xs = longitudinal.copias.map((c) => Math.abs(c.x));
    expect(Math.max(...xs)).toBeCloseTo(a, 9);
    expect(longitudinal.forma.at(-1)!.z).toBeCloseTo(3.2, 9);
  });
});

describe("perfis de pilar", () => {
  const base: Pilar = { id: "p", nome: "P1", x: 1, y: 2, b: 20, h: 40 };

  it("retângulo b × h; circular com vazado; poligonal centrado pela caixa e anti-horário", () => {
    expect(perfilPilar(base)).toEqual({ tipo: "retangulo", largura: 0.2, altura: 0.4 });
    expect(perfilPilar({ ...base, secao: { tipo: "circular", d: 40, dInterno: 0 } })).toEqual({
      tipo: "circulo",
      raio: 0.2,
    });
    expect(perfilPilar({ ...base, secao: { tipo: "circular", d: 40, dInterno: 20 } })).toEqual({
      tipo: "circulo",
      raio: 0.2,
      parede: 0.1,
    });
    // L de 40 × 40 com braços de 20, horário como o PILDADOS
    const l = perfilPilar({
      ...base,
      secao: {
        tipo: "poligonal",
        vertices: [
          { x: 0, y: 0 },
          { x: 0, y: 40 },
          { x: 20, y: 40 },
          { x: 20, y: 20 },
          { x: 40, y: 20 },
          { x: 40, y: 0 },
        ],
      },
    });
    expect(l.tipo).toBe("poligono");
    if (l.tipo !== "poligono") return;
    expect(l.pontos[0]).toEqual({ x: 0.2, y: -0.2 });
    const area = l.pontos.reduce((s, p, k) => {
      const q = l.pontos[(k + 1) % l.pontos.length]!;
      return s + (p.x * q.y - q.x * p.y) / 2;
    }, 0);
    expect(area).toBeCloseTo(0.12, 9); // 40·40 − 20·20 cm², positiva = anti-horário
  });

  it("rotação vai ao elemento em radianos", () => {
    const obra = obraTresPavimentos();
    const pav = obra.pavimentos[0]!;
    pav.pilares[0] = { ...pav.pilares[0]!, rotacao: 30 };
    const p = modeloIfc(obra, null).elementos.find(
      (e) =>
        e.tipo === "pilar" &&
        e.propriedades.NivelTopo === "Cobertura" &&
        e.nome === pav.pilares[0]!.nome,
    ) as PilarIfc;
    expect(p.rotacao).toBeCloseTo(Math.PI / 6, 12);
    expect(p.propriedades.Rotacao_graus).toBe(30);
  });
});

describe("vigas com a seção do DESENHO", () => {
  it("um trecho por tramo; T quando a mesa é mais larga que a alma", () => {
    const v = {
      id: "v",
      nome: "V1",
      x1: 0,
      y1: 0,
      x2: 8,
      y2: 0,
      bw: 12,
      h: 50,
      cargaLinear: 0,
      secoes: {
        trechos: [
          { bw: 12, h: 40, bf: 0, hf: 0 },
          { bw: 15, h: 50, bf: 60, hf: 10 },
        ],
      },
    };
    expect(trechosDaViga(v, [0, 4, 8], 8)).toEqual([
      { inicio: 0, fim: 4, perfil: { tipo: "retangulo", largura: 0.12, altura: 0.4 } },
      {
        inicio: 4,
        fim: 8,
        perfil: { tipo: "T", altura: 0.5, mesa: 0.6, espessuraMesa: 0.1, alma: 0.15 },
      },
    ]);
    // sem um nó por tramo: bw × h na viga inteira
    expect(trechosDaViga(v, [0, 8], 8)).toEqual([
      { inicio: 0, fim: 8, perfil: { tipo: "retangulo", largura: 0.12, altura: 0.5 } },
    ]);
  });
});

describe("obra E2E do oráculo (NB-1/78 pelo SISTRUT)", () => {
  const obra = importada(OBRA_E2E);
  const m = modeloIfc(obra, calculado(obra));
  const v1 = m.elementos.find((e) => e.tipo === "viga" && e.nome === "V1") as VigaIfc;

  it("seção 12 × 40 do .SEC em cada tramo; barras do DESINIT a partir da face do apoio", () => {
    expect(v1.trechos.map((t) => t.perfil)).toEqual([
      { tipo: "retangulo", largura: 0.12, altura: 0.4 },
      { tipo: "retangulo", largura: 0.12, altura: 0.4 },
    ]);
    // positiva N4: 2 a 818 cm da face externa do pilar de 20 cm (−10 cm do eixo)
    const n4 = v1.armadura.find((p) => p.nome === "N4")!;
    expect(n4.tipo).toBe("positiva");
    expect(n4.forma.map((p) => p.x).filter((x, i, xs) => xs.indexOf(x) === i)).toEqual([
      expect.closeTo(-0.08, 9),
      expect.closeTo(8.08, 9),
    ]);
    // estribos N7: 23 + 23 dos trechos 20–400 e 420–800, c/ 17
    const n7 = v1.armadura.find((p) => p.nome === "N7")!;
    expect(n7.copias).toHaveLength(46);
    expect(n7.copias[0]!.x).toBeCloseTo(0.1, 9);
    expect(n7.copias[1]!.x).toBeCloseTo(0.27, 9);
  });

  it("Pset com nome original, seção, fck, cobrimento e modo de cálculo", () => {
    expect(v1.propriedades).toMatchObject({
      Nome: "V1",
      Secao: "12 × 40 cm",
      Concreto: m.concreto,
      Cobrimento_cm: obra.materiais.cobrimentoViga,
      Norma: "NB-1/78",
      ModoCalculo: obra.modoCalculo,
      Calculado: true,
    });
  });

  it("viga: Mk e Vk; sem Md, que o DESDIM calcula com o γf do .DSP", () => {
    expect(v1.propriedades.MkPositivo_kNm).toBeGreaterThan(0);
    expect(v1.propriedades.Vk_kN).toBeGreaterThan(0);
    expect(v1.propriedades).not.toHaveProperty("MdPositivo_kNm");
  });

  it("LPi do .FOR de 30 cm (pilar de 20): as barras partem 5 cm antes", () => {
    const outra = importada(OBRA_E2E);
    const pav = outra.pavimentos[0]!;
    pav.vigas = pav.vigas.map((v) =>
      v.nome === "V1" ? { ...v, forma: { ...v.forma, apoios: [{ largura: 30 }] } } : v,
    );
    const v = modeloIfc(outra, calculado(outra)).elementos.find(
      (e) => e.tipo === "viga" && e.nome === "V1",
    )!;
    const n4 = v.armadura.find((p) => p.nome === "N4")!;
    // face externa a −15 cm do eixo, positiva a 2 cm dela
    expect(Math.min(...n4.forma.map((p) => p.x))).toBeCloseTo(-0.13, 9);
  });

  it("laje sem flecha no Pset: o caminho do SISTRUT não a calcula", () => {
    const l1 = m.elementos.find((e) => e.tipo === "laje" && e.nome === "L1")!;
    expect(l1.propriedades.Asx_cm2_m).toBeGreaterThan(0);
    expect(l1.propriedades).not.toHaveProperty("Flecha_cm");
    expect(l1.propriedades).not.toHaveProperty("FlechaLimite_cm");
  });
});

describe("escada importada do SISTRUT", () => {
  const obra = importada(PREDIO);
  const escada = obra.pavimentos.find((p) => p.id === "ESCADA")!;

  it("é reconhecida, sai da pilha de níveis e, sem cota deduzível, fica num nível em 0", () => {
    expect(pavimentoDeVigasAvulsas(escada)).toBe(true);
    expect(obra.pavimentos.filter(pavimentoDeVigasAvulsas)).toHaveLength(1);
    // o ESCADA.VIG da fixture é o E2E.VIG (vigas de 2 tramos): sem reação de biapoiada,
    // não há como casar com as cargas do prédio
    const m = modeloIfc(obra, null);
    expect(m.niveis.map((n) => [n.nome, n.elevacao])).toEqual([
      ["Fundação", 0],
      ["ESCADA (cota não definida)", 0],
      ["BASE", 0.4],
      ["TETO", 3.4],
    ]);
    const doNivel = m.elementos.filter((e) => e.nivel.pavimento?.id === "ESCADA");
    expect(doNivel.map((e) => e.tipo)).toEqual(escada.vigas.map(() => "viga"));
    expect(
      doNivel.every((e) => e.tipo === "viga" && e.escada && e.propriedades.CotaIncerta === true),
    ).toBe(true);
    expect(m.avisos.join()).toMatch(/ESCADA: nenhuma carga/);
  });
});

describe("escada com as reações lançadas nas vigas do prédio", () => {
  // R0 = 20 kN no Térreo, R1 = 10 kN no Tipo (ver obraComEscada)
  const { obra, escada: avulso, apoio0: p0, apoio1: p1 } = obraComEscada();

  it("vai do apoio no Térreo (3,2 m) ao apoio no Tipo mais baixo (6,0 m), no nível do Térreo", () => {
    const m = modeloIfc(obra, null);
    expect(m.niveis.map((n) => n.nome)).toEqual([
      "Fundação",
      "Térreo",
      "Tipo (2/2)",
      "Tipo (1/2)",
      "Cobertura",
    ]);
    const e = m.elementos.find((x) => x.nome === "E1") as VigaIfc;
    expect(e.nivel.nome).toBe("Térreo");
    expect(e.origem).toEqual({ ...p0, z: 0 });
    const fim = {
      x: e.origem.x + e.direcao.x * e.comprimento,
      y: e.origem.y + e.direcao.y * e.comprimento,
      z: e.origem.z + e.direcao.z * e.comprimento,
    };
    expect(fim.x).toBeCloseTo(p1.x, 9);
    expect(fim.y).toBeCloseTo(p1.y, 9);
    expect(fim.z).toBeCloseTo(2.8, 9);
    expect(e.propriedades).toMatchObject({ Escada: true, CotaIncerta: false });
    expect(e.propriedades.PosicaoDeduzida).toMatch(/Térreo.*Tipo/);
    expect(deduzirApoiosEscada(avulso, []).size).toBe(0);
  });
});

describe("resultados sem solução e seção 0 do .SEC", () => {
  it("pilar sem solução sai com Nk e 'sem solução', sem NaN no arquivo", () => {
    // P1 da cobertura 12 × 12 com pé-direito 6 m: λ ≈ 173, sem solução (repro da revisão)
    const obra = obraTresPavimentos();
    const cob = obra.pavimentos[0]!;
    obra.pavimentos[0] = {
      ...cob,
      peDireito: 6,
      pilares: cob.pilares.map((p, i) => (i === 0 ? { ...p, b: 12, h: 12 } : p)),
    };
    const calc = calculado(obra);
    const p = modeloIfc(obra, calc).elementos.find(
      (e) =>
        e.tipo === "pilar" &&
        e.propriedades.NivelTopo === "Cobertura" &&
        e.nome === cob.pilares[0]!.nome,
    )!;
    expect(p.propriedades.Armadura).toBe("sem solução");
    expect(p.propriedades).not.toHaveProperty("Taxa_pct");
    expect(gerarIfc(obra, calc, { data: DATA }).conteudo).not.toMatch(/[(,]-?NaN[,)]/); // NaN como valor (o texto "NaN" pode cair num GlobalId);
  });

  it("trecho com seção 0: o balanço herda a do apoio vizinho; o tramo usa bw × h", () => {
    const v = {
      id: "v",
      nome: "V1",
      x1: 0,
      y1: 0,
      x2: 9,
      y2: 0,
      bw: 12,
      h: 50,
      cargaLinear: 0,
      secoes: {
        trechos: [
          { bw: 0, h: 0, bf: 0, hf: 0 },
          { bw: 0, h: 0, bf: 0, hf: 0 },
        ],
        apoios: [
          { bw: 20, h: 45 },
          { bw: 20, h: 45 },
        ],
      },
    };
    expect(trechosDaViga(v, [0, 1, 9], 9).map((t) => t.perfil)).toEqual([
      { tipo: "retangulo", largura: 0.2, altura: 0.45 },
      { tipo: "retangulo", largura: 0.2, altura: 0.45 },
    ]);
    const tres = {
      ...v,
      secoes: { ...v.secoes, trechos: [...v.secoes.trechos, { bw: 0, h: 0, bf: 0, hf: 0 }] },
    };
    expect(trechosDaViga(tres, [0, 1, 5, 9], 9)[1]!.perfil).toEqual({
      tipo: "retangulo",
      largura: 0.12,
      altura: 0.5,
    });
  });
});

describe("arquivo IFC", () => {
  const obra = obraTresPavimentos();
  const calc = calculado(obra);
  const { conteudo } = gerarIfc(obra, calc, { data: DATA });
  const contar = (entidade: string) => conteudo.split(`=${entidade}(`).length - 1;

  it("IFC4 com projeto, terreno, prédio, um storey por nível e os elementos", () => {
    expect(conteudo).toMatch(/^ISO-10303-21;\nHEADER;/);
    expect(conteudo).toContain("FILE_SCHEMA(('IFC4'));");
    expect(conteudo.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
    expect(contar("IFCPROJECT")).toBe(1);
    expect(contar("IFCSITE")).toBe(1);
    expect(contar("IFCBUILDING")).toBe(1);
    expect(contar("IFCBUILDINGSTOREY")).toBe(5);
    expect(contar("IFCCOLUMN")).toBe(24);
    expect(contar("IFCBEAM")).toBe(20);
    expect(contar("IFCSLAB")).toBe(8);
    expect(contar("IFCREINFORCINGBAR")).toBeGreaterThan(0);
    expect(conteudo).toContain("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
    // storey do Térreo: placement e Elevation em 3,2 (topo da laje) e a SSL no Pset próprio
    expect(conteudo).toMatch(
      /=IFCBUILDINGSTOREY\('[^']+',#\d+,'T\\X2\\00E9\\X0\\rreo',\$,\$,#\d+,\$,\$,\.ELEMENT\.,3\.2\);/,
    );
    expect(conteudo).toContain("IFCPROPERTYSINGLEVALUE('ElevationOfSSLRelative',$,IFCREAL(3.2),$)");
    expect(conteudo).toContain(`IFCMATERIAL('Concreto C${obra.materiais.fck}',$,'concrete')`);
  });

  it("mesma obra, mesmo arquivo; GlobalIds únicos", () => {
    expect(gerarIfc(obra, calc, { data: DATA }).conteudo).toBe(conteudo);
    // GlobalId das IfcRoot (seguido da referência ao OwnerHistory): um nome de propriedade
    // de 22 letras, como 'ElevationOfSSLRelative', não conta
    const ids = [...conteudo.matchAll(/=IFC[A-Z]+\('([0-9A-Za-z_$]{22})',#\d+,/g)].map((x) => x[1]);
    expect(ids.length).toBeGreaterThan(100);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sem cálculo também exporta, sem barras e marcado como não calculado", () => {
    const sem = gerarIfc(obra, null, { data: DATA }).conteudo;
    expect(sem.split("=IFCCOLUMN(").length - 1).toBe(24);
    expect(sem).not.toContain("=IFCREINFORCINGBAR(");
    expect(sem).toContain("IFCPROPERTYSINGLEVALUE('Calculado',$,IFCBOOLEAN(.F.),$)");
  });
});
