// Importação da obra FLUXO da V1. Os arquivos em __fixtures__/v1 são os que a V1
// gravou ao rodar tests/T_FLUXO.BAS (dist/roteiros/saida/lajcal_02_grav-*/ FLUXO.LAJ,
// .VIG, .COL); FLUXO-semente.LAJ é o de dist/roteiros/semente, gravado por uma versão
// anterior da V1 com NUL nos bordos não preenchidos.
import { describe, expect, it } from "vitest";
import { calcularObra } from "../calculo/fluxo";
import { nb178 } from "../calculo/normas";
import type { Norma } from "../calculo/tipos";
import { KN_POR_TF } from "../calculo/unidades";
import type { Laje } from "../dominio/obra";
import fluxoCol from "./__fixtures__/v1/FLUXO.COL?raw";
import fluxoLaj from "./__fixtures__/v1/FLUXO.LAJ?raw";
import fluxoVig from "./__fixtures__/v1/FLUXO.VIG?raw";
import fluxoSemente from "./__fixtures__/v1/FLUXO-semente.LAJ?raw";
import { camposQB, importarV1, type ImportacaoV1 } from "./importarV1";

const LAJ = { nome: "FLUXO.LAJ", texto: fluxoLaj };
const VIG = { nome: "FLUXO.VIG", texto: fluxoVig };
const COL = { nome: "FLUXO.COL", texto: fluxoCol };

const tf = (kn: number) => kn / KN_POR_TF;

function importada(r: ImportacaoV1) {
  if (!r.ok) throw new Error(r.erros.join("\n"));
  return r;
}
function erros(r: ImportacaoV1) {
  if (r.ok) throw new Error("esperado erro, a importação passou");
  return r.erros;
}

describe("camposQB: arquivo sequencial do QuickBASIC (WRITE #)", () => {
  it("separa texto entre aspas e números, com vírgula ou fim de linha, CRLF e Ctrl+Z", () => {
    const c = camposQB('"L1",0,.1, -2.5E-1 ,"a,b"\r\n1D+02,""\r\n\u001a"lixo"');
    expect(c.map((x) => [x.valor, x.aspas, x.linha])).toEqual([
      ["L1", true, 1],
      ["0", false, 1],
      [".1", false, 1],
      ["-2.5E-1", false, 1],
      ["a,b", true, 1],
      ["1D+02", false, 2],
      ["", true, 2],
    ]);
  });
});

describe("importar a obra FLUXO da V1", () => {
  const r = importada(importarV1([LAJ, VIG, COL]));
  const pav = r.obra.pavimentos[0]!;
  const laje = (nome: string) => pav.lajes.find((l) => l.nome === nome)!;

  it('obra, norma e pavimento (FLUXO.LAJ linha 1; FLUXO.COL linha 3: "TERREO",3,3)', () => {
    expect(r.obra.nome).toBe("FLUXO");
    expect(r.obra.norma).toBe("nb1-78");
    expect(r.obra.pavimentos).toHaveLength(1);
    expect(pav.nome).toBe("TERREO");
    expect(pav.peDireito).toBe(3);
  });

  it("mesma quantidade de lajes, com posição, dimensões, h e cargas do .LAJ", () => {
    // FLUXO.LAJ linha 2: nível 1, 2 lajes
    expect(pav.lajes).toHaveLength(2);
    const sem = ({ id: _id, ...l }: Laje) => l;
    // linha 3: "L1",0,0,4,5,10,"AAEA",.1,.15,"V3/V2/V4/V1" (g e q em tf/m²)
    expect(sem(laje("L1"))).toEqual({
      nome: "L1",
      x: 0,
      y: 0,
      lx: 4,
      ly: 5,
      h: 10,
      revestimento: 0.1 * 9.80665,
      sobrecarga: 0.15 * 9.80665,
      vinculos: {},
      mu: 1,
    });
    // linha 4: "L2",4,0,3.5,5,10,"EAAA",.1,.15,"V4/V2/V5/V1"
    expect(sem(laje("L2"))).toEqual({
      nome: "L2",
      x: 4,
      y: 0,
      lx: 3.5,
      ly: 5,
      h: 10,
      revestimento: 0.1 * 9.80665,
      sobrecarga: 0.15 * 9.80665,
      vinculos: {},
      mu: 1,
    });
  });

  it("vínculos E/A iguais aos que a V2 detecta ficam automáticos e calculam como no .LAJ", () => {
    const c = calcularObra(r.obra, nb178);
    const vinc = (nome: string) =>
      c.pavimentos[0]!.lajes.find((l) => l.laje.nome === nome)!.entrada.vinculos;
    // "AAEA": esquerdo, inferior, direito, superior
    expect(vinc("L1")).toEqual({
      esquerdo: "apoiado",
      inferior: "apoiado",
      direito: "engastado",
      superior: "apoiado",
    });
    // "EAAA"
    expect(vinc("L2")).toEqual({
      esquerdo: "engastado",
      inferior: "apoiado",
      direito: "apoiado",
      superior: "apoiado",
    });
  });

  it("vigas: as 5 do .VIG casam com as geradas, com a seção da V1 e sem carga adicional", () => {
    // FLUXO.VIG: V3 12x50 (linha 3), V2 12x40 (linha 7), V4 12x50 (13), V1 12x40 (17), V5 12x50 (23)
    const secoes = Object.fromEntries(pav.vigas.map((v) => [v.nome, [v.bw, v.h, v.cargaLinear]]));
    expect(secoes).toEqual({
      V1: [12, 40, 0],
      V2: [12, 40, 0],
      V3: [12, 50, 0],
      V4: [12, 50, 0],
      V5: [12, 50, 0],
    });
  });

  it("pilares: os 6 do .COL com seção 20 x 30", () => {
    // FLUXO.COL linhas 4, 6, ..., 14: "P4","R",20,30,0,0 etc.
    expect(pav.pilares).toHaveLength(6);
    expect(pav.pilares.every((p) => p.b === 20 && p.h === 30)).toBe(true);
    expect(pav.pilares.find((p) => p.x === 4 && p.y === 0)?.nome).toBe("P5");
  });

  it("avisos só do que a V1 não grava ou a V2 não importa", () => {
    expect(r.avisos).toHaveLength(2);
    expect(r.avisos[0]).toMatch(/^Materiais: /);
    // o .LAJ não tem classe do aço nem ortotropia (TLaje): padrão A e μ = 1, com aviso
    expect(r.obra.materiais.classeAco).toBe("A");
    expect(r.avisos[0]).toContain("aço classe A");
    expect(r.avisos[0]).toContain("μ = 1 (isótropa)");
    expect(r.avisos[1]).toMatch(/^Resultados gravados pela V1/);
  });
});

describe("obra FLUXO importada calculada pela NB-1/78", () => {
  // Mesma norma de src/calculo/fluxo.test.ts: a NB-1/78 com o concreto de 2,5 tf/m³ da V1
  // (os momentos das lajes dependem só da carga).
  const nb178V1: Norma = { ...nb178, pesoConcreto: 2.5 * KN_POR_TF };
  const r = importada(importarV1([LAJ, VIG, COL]));
  const c = calcularObra(r.obra, nb178V1);
  const rp = c.pavimentos[0]!;

  it("momentos da L1 iguais aos da V1 (FLUXO.LAJ, bloco RES, linha 6)", () => {
    const l1 = rp.lajes.find((l) => l.laje.nome === "L1")!.esforcos;
    expect(tf(l1.mx)).toBeCloseTo(0.2993489, 5);
    expect(tf(l1.my)).toBeCloseTo(0.2758809, 5);
    expect(tf(l1.negativos.direito)).toBeCloseTo(0.5048257, 5);
  });

  it("peso próprio das vigas com a seção importada: 22,8 tf nos pilares, como em fluxo.test.ts", () => {
    expect(tf(rp.equilibrio.cargaPilares)).toBeCloseTo(22.8, 6);
  });
});

describe("importação: casos fora do esperado", () => {
  it("bordos com NUL (gravados por versão antiga da V1) viram apoiado, com aviso", () => {
    const r = importada(importarV1([{ nome: "FLUXO.LAJ", texto: fluxoSemente }]));
    const pav = r.obra.pavimentos[0]!;
    expect(pav.lajes.map((l) => l.vinculos)).toEqual([{}, {}]);
    expect(r.avisos).toContain(
      "FLUXO.LAJ, linha 3: laje L1, bordos sem letra A/E/L: esquerdo (em branco), inferior (em branco), superior (em branco); lidos como apoiado, como a V1 faz.",
    );
    // sem o .COL: pavimento com nome do nível e pé-direito padrão, avisado
    expect(pav.nome).toBe("Nível 1");
    expect(r.avisos).toContain(
      'Sem o nível 1 no .COL: pavimento "Nível 1" com pé-direito de 3 m. Confira.',
    );
  });

  it("vínculo diferente do detectado fica forçado, com aviso", () => {
    // L1 com o bordo direito apoiado (LAJECALC pode trocar E por A)
    const texto = fluxoLaj.replace('"AAEA"', '"AAAA"');
    const r = importada(importarV1([{ nome: "FLUXO.LAJ", texto }]));
    const l1 = r.obra.pavimentos[0]!.lajes.find((l) => l.nome === "L1")!;
    expect(l1.vinculos).toEqual({ direito: "apoiado" });
    expect(r.avisos).toContain(
      "Laje L1, bordo direito: na V1 apoiado, a V2 detectaria engastado pela vizinhança; ficou apoiado (forçado).",
    );
  });

  it("bordo livre vira vínculo livre forçado", () => {
    const texto = fluxoLaj.replace('"EAAA"', '"EAAL"');
    const r = importada(importarV1([{ nome: "FLUXO.LAJ", texto }]));
    const l2 = r.obra.pavimentos[0]!.lajes.find((l) => l.nome === "L2")!;
    expect(l2.vinculos).toEqual({ superior: "livre" });
  });

  it("carga de parede no .VIG além das lajes vira carga linear; acidental extra só aviso", () => {
    // V3 (vão 5 m): qPerm .3627... + 0,2 tf/m de parede; qAcid + 0,05 tf/m
    const texto = fluxoVig.replace(
      "5,.3627555555554863,.155466666666637,0",
      "5,.5627555555554863,.205466666666637,0",
    );
    const r = importada(importarV1([LAJ, { nome: "FLUXO.VIG", texto }, COL]));
    const v3 = r.obra.pavimentos[0]!.vigas.find((v) => v.nome === "V3")!;
    expect(tf(v3.cargaLinear)).toBeCloseTo(0.2, 9);
    expect(r.avisos.some((a) => a.includes("V3: carga acidental além das lajes"))).toBe(true);
  });

  it("h = 0 (a calcular) usa o h do bloco RES, com aviso", () => {
    const texto = fluxoLaj.replace('"L1",0,0,4,5,10,', '"L1",0,0,4,5,0,');
    const r = importada(importarV1([{ nome: "FLUXO.LAJ", texto }]));
    expect(r.obra.pavimentos[0]!.lajes[0]!.h).toBe(10);
    expect(r.avisos.some((a) => a.includes("h = 0 (a calcular); usado o h = 10 cm"))).toBe(true);
  });

  it("laje com dimensão zero fica de fora, com aviso", () => {
    const texto = fluxoLaj.replace('"L2",4,0,3.5,5,', '"L2",4,0,0,5,');
    const r = importada(importarV1([{ nome: "FLUXO.LAJ", texto }]));
    expect(r.obra.pavimentos[0]!.lajes.map((l) => l.nome)).toEqual(["L1"]);
    expect(
      r.avisos.some((a) => a.includes("laje L2 com lx = 0 m") && a.includes("NÃO importada")),
    ).toBe(true);
  });

  it("pilar circular do .COL não é importado, com aviso", () => {
    const texto = fluxoCol.replace('"P5","R",20,30,4,0', '"P5","C",30,0,4,0');
    const r = importada(importarV1([LAJ, VIG, { nome: "FLUXO.COL", texto }]));
    const p5 = r.obra.pavimentos[0]!.pilares.find((p) => p.nome === "P5")!;
    expect([p5.b, p5.h]).toEqual([20, 20]);
    expect(r.avisos.some((a) => a.includes("pilar P5") && a.includes("seção circular"))).toBe(true);
  });

  // A V2 não lê a configuração da V1 (.LAP, .DSP, .PIP, .FOP, .INI): os materiais saem
  // dos padrões, com o aviso "Materiais". Com o renome da V1 para OpenStrut, esses
  // arquivos passaram de SISTRUT.* para OPENSTRUT.*; os dois nomes têm o mesmo tratamento.
  it.each(["OPENSTRUT", "SISTRUT"])(
    "configuração da V1 (%s.LAP, .DSP...) escolhida junto é ignorada, com aviso",
    (prefixo) => {
      const config = ["LAP", "DSP", "PIP", "FOP", "INI"].map((ext) => ({
        nome: `${prefixo}.${ext}`,
        texto: "1\r\n",
      }));
      const r = importada(importarV1([LAJ, VIG, COL, ...config]));
      for (const c of config)
        expect(r.avisos).toContain(`${c.nome} ignorado: só .LAJ, .VIG e .COL são importados.`);
      expect(r.obra.pavimentos[0]!.lajes.map((l) => l.nome)).toEqual(["L1", "L2"]);
      expect(r.obra.pavimentos[0]!.pilares.every((p) => p.b === 20 && p.h === 30)).toBe(true);
    },
  );

  it(".VIG de outra obra é ignorado, com aviso", () => {
    const texto = fluxoVig.replace('"VIG",1,"FLUXO"', '"VIG",1,"OUTRA"');
    const r = importada(importarV1([LAJ, { nome: "FLUXO.VIG", texto }]));
    expect(r.avisos).toContain(
      'FLUXO.VIG é da obra "OUTRA" e o .LAJ da obra "FLUXO"; FLUXO.VIG ignorado.',
    );
  });
});

describe("importação: arquivos inválidos dão erro claro", () => {
  it("sem .LAJ", () => {
    expect(erros(importarV1([VIG]))).toEqual([
      "Selecione o arquivo .LAJ da obra (e, se quiser, o .VIG e o .COL dela).",
    ]);
  });

  it("cabeçalho de outro tipo", () => {
    const [e] = erros(importarV1([{ nome: "FLUXO.LAJ", texto: fluxoVig }]));
    expect(e).toBe(
      'FLUXO.LAJ: não é um .LAJ da V1: o cabeçalho deveria ser "SISTRUT40","LAJ",1,"<obra>" e veio "SISTRUT40","VIG",1,"FLUXO". A V1 também recusa este arquivo ("Arquivo invalido ou de outra versao").',
    );
  });

  it("arquivo binário ou de texto qualquer", () => {
    const [e] = erros(importarV1([{ nome: "X.LAJ", texto: "\u0000\u0001lixo binário" }]));
    expect(e).toMatch(/^X\.LAJ: não é um \.LAJ da V1: o cabeçalho deveria ser/);
  });

  it("arquivo vazio", () => {
    const [e] = erros(importarV1([{ nome: "X.LAJ", texto: "" }]));
    expect(e).toMatch(/^X\.LAJ: não é um \.LAJ da V1/);
  });

  it(".LAJ truncado no meio de uma laje", () => {
    // o checkout pode trazer o fixture com LF (.gitattributes eol=lf)
    const texto = fluxoLaj
      .split(/\r?\n/)
      .slice(0, 3)
      .join("\r\n")
      .replace(/,"V3\/V2\/V4\/V1"$/, "");
    const [e] = erros(importarV1([{ nome: "FLUXO.LAJ", texto }]));
    expect(e).toBe("FLUXO.LAJ: arquivo truncado ou corrompido: acabou sem as vigas da laje L1.");
  });

  it(".LAJ sem a segunda laje", () => {
    const texto = fluxoLaj.split(/\r?\n/).slice(0, 3).join("\r\n");
    const [e] = erros(importarV1([{ nome: "FLUXO.LAJ", texto }]));
    expect(e).toBe("FLUXO.LAJ: arquivo truncado ou corrompido: acabou sem o nome da laje 2.");
  });

  it(".VIG truncado", () => {
    const texto = fluxoVig.split(/\r?\n/).slice(0, 10).join("\r\n");
    const [e] = erros(importarV1([LAJ, { nome: "FLUXO.VIG", texto }]));
    expect(e).toMatch(
      /^FLUXO\.VIG: arquivo truncado ou corrompido: acabou sem o vão do tramo 1 da viga V2\.$/,
    );
  });

  it("número inválido aponta a linha", () => {
    const texto = fluxoLaj.replace('"L2",4,0,3.5,', '"L2",4,0,3x5,');
    const [e] = erros(importarV1([{ nome: "FLUXO.LAJ", texto }]));
    expect(e).toBe("FLUXO.LAJ, linha 4: lx da laje L2: esperado um número, veio 3x5.");
  });

  it("aspa sem fechamento", () => {
    const [e] = erros(importarV1([{ nome: "A.LAJ", texto: '"SISTRUT40","LAJ,1,"A"' }]));
    expect(e).toBe('A.LAJ, linha 1: esperada uma vírgula depois do texto, veio "A".');
  });

  it("dois .LAJ", () => {
    const [e] = erros(importarV1([LAJ, { ...LAJ, nome: "OUTRA.LAJ" }]));
    expect(e).toMatch(/^Selecione um \.LAJ só \(vieram FLUXO\.LAJ, OUTRA\.LAJ\)/);
  });
});
