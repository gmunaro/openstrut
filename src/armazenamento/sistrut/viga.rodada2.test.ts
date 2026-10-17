/// <reference types="node" />
// Rodada 2 do modelo de vigas contra o oráculo e contra a conta à mão:
// - carga indexada digitada no VIGA ("*1.01", a reação do apoio 1 da V20 na V21) e números
//   de pilar da opção 7 gravados no J: retrad_viga_x1 (oraculo/runs/
//   retrad_viga_x1-20261015-065711 em src/calculo/sistrut/__oraculo__/arquivos/; esperados em src/calculo/sistrut/vigas/__casos__/x1.json:
//   op2.* da opção 2, com J 1, e op7.* da opção 7 sobre o IDX.VIG regravado, mais o IDX.REP);
// - vigas digitadas sem marca no J: retrad_viga_a1 (NOVA.VIG do run);
// - opção 7 com apoio desconsiderado, redução 85 %, momentos externos e reação máxima:
//   retrad_viga_c1 (E2E.VIG do run; os valores da V2, V4 e V5);
// - repetições por viga do .TAB, DESENHO.INI, números de pilar diferentes dos da planta;
// - a montagem da obra importada do .LAJ grava o .VIG do LAJEMONT bit a bit (item 6).
// Sem um arquivo do oráculo, o teste que o lê falha com o caminho (arquivoOraculo).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bateComImpresso, type CasoOraculo } from "../../calculo/sistrut/__oraculo__";
import { arquivoOraculo } from "../../calculo/sistrut/__oraculo__/arquivosOraculo";
import { obraE2E } from "../../calculo/sistrut/__e2e__/obraE2E";
import { KN_POR_TF } from "../../calculo/sistrut/base/unidades";
import { calcularObraSistrut, type ResultadoSistrut } from "../../calculo/sistrut/obra";
import { linhasArquivoRep } from "../../calculo/sistrut/vigas/rep";
import { textoMep } from "../../calculo/sistrut/vigas/vicalc";
import { qbCint } from "../../calculo/sistrut/base/f32";
import { calcularObra } from "../../calculo/fluxo";
import { nb178 } from "../../calculo/normas";
import { calcularQuantitativos } from "../../calculo/quantitativos";
import { materiaisPadrao } from "../../dominio/criar";
import type { ArmaduraDigitada, Obra, ParametrosVigaIni } from "../../dominio/obra";
import { type RegistroTeste, V1, vig } from "./__teste__/vig";
import { importarLaj } from "./laje";
import { dadosDoRegistro, importarVigasSistrut, lerDesenhoIni, lerTab, lerVig } from "./viga";

const RUNS = "oraculo/runs";
const CASOS = join(import.meta.dirname, "../../calculo/sistrut/vigas/__casos__");
const X1 = `${RUNS}/retrad_viga_x1-20261015-065711/obra`;
const A1 = `${RUNS}/retrad_viga_a1-20261015-065711/obra`;
const C1 = `${RUNS}/retrad_viga_c1-20261015-065711/obra`;
const CASO_A = `${RUNS}/caso_a_laje-20261015-041425/obra`;
const VBX = `${RUNS}/v2par_viga_fluxo-20261015-164332/obra`;
const ORIG = "oraculo/orig";

const arquivo = (caminho: string) => ({
  nome: caminho.slice(caminho.lastIndexOf("/") + 1),
  dados: new Uint8Array(readFileSync(arquivoOraculo(caminho))),
});
const caso = (nome: string): CasoOraculo & { parametros: ParametrosVigaIni } =>
  JSON.parse(readFileSync(join(CASOS, `${nome}.json`), "utf8"));
function importa(...args: Parameters<typeof importarVigasSistrut>) {
  const r = importarVigasSistrut(...args);
  if (!r.ok) throw new Error(r.erros.join("\n"));
  return r;
}
const comParametros = (o: Obra, viga: Partial<ParametrosVigaIni>): Obra => ({
  ...o,
  parametrosViga: { ...o.parametrosViga, viga },
});

type Valor = number | string | undefined;

/** Análise do VIGA pelos ids dos casos retrad_viga_* (op2./op7. na frente; a<k>.Mmax,
 *  Rmax, Rmin; ep<i> = i-ésima linha da tabela de engastamento perfeito; b<k>.carga). */
function analise(r: ResultadoSistrut, id: string): Valor {
  const m = /^(?:op\d\.)?([A-Z]+\d+)\.(.+)$/.exec(id);
  if (!m) return undefined;
  const a = r.pavimentos[0]!.analises.find((x) => x.nome === m[1]);
  if (!a) return undefined;
  const resto = m[2]!;
  if (resto === "somaR") return a.somaReacoes;
  const n = a.tramos.length;
  let x = /^MEP(\d+)$/.exec(resto);
  if (x) return textoMep(Number(x[1]) === 0 ? a.mepEsquerdo : a.mepDireito, r.modo);
  x = /^a(\d+)\.(M-|R|Mmax|Rmax|Rmin)$/.exec(resto);
  if (x) {
    const ap = a.apoios[Number(x[1])];
    const c: Record<string, Valor> = {
      "M-": ap?.m,
      R: ap?.r,
      Mmax: ap?.mMax,
      Rmax: ap?.rMax,
      Rmin: ap?.rMin,
    };
    return c[x[2]!];
  }
  x = /^ep(\d+)\.(Ve|x|M\+|Vd)$/.exec(resto);
  if (x) {
    const l = a.engastamentoPerfeito[Number(x[1]) - 1];
    const c: Record<string, Valor> = { Ve: l?.ve, x: l?.x, "M+": l?.mPositivo, Vd: l?.vd };
    return c[x[2]!];
  }
  x = /^b(\d+)\.carga$/.exec(resto);
  if (x) return Number(x[1]) === 0 ? a.balancoEsquerdo?.carga : a.balancoDireito?.carga;
  x = /^t(\d+)\.(max\.)?(Ve|x|M\+|Vd|fEJ)$/.exec(resto);
  if (!x || Number(x[1]) > n) return undefined;
  const t = a.tramos[Number(x[1]) - 1];
  const e = x[2] ? t?.envoltoria : t;
  const c: Record<string, Valor> = {
    Ve: e?.ve,
    x: e?.x,
    "M+": e?.mPositivo,
    Vd: e?.vd,
    fEJ: e?.fEJ,
  };
  return c[x[3]!];
}

function confere(r: ResultadoSistrut, c: CasoOraculo, filtro: (id: string) => boolean) {
  const difere: string[] = [];
  const faltando: string[] = [];
  let conferidos = 0;
  for (const v of c.valores) {
    if (!filtro(v.id)) continue;
    const x = analise(r, v.id);
    if (x === undefined) {
      faltando.push(v.id);
      continue;
    }
    conferidos++;
    const ok = typeof x === "string" ? x === v.impresso : bateComImpresso(v, x);
    if (!ok) difere.push(`${v.id}: impresso ${v.impresso}, calculado ${x}`);
  }
  return { difere, faltando, conferidos };
}

/** retrad_viga_x1 pela opção 2: a obra do roteiro (oraculo/casos/retrad_viga_x1.txt, não versionado),
 *  com o "*1.01" do F da V21 como carga indexada. VIGA com acidentais S fornecidas. */
function obraX1(): Obra {
  const g = KN_POR_TF;
  const pilar = (nome: string, x: number, y: number) => ({ id: nome, nome, x, y, b: 20, h: 20 });
  const dist = (trecho: number, inicio: number, fim: number, pac: number) => ({
    tipo: "distribuida" as const,
    trecho,
    inicio,
    fim,
    total: g,
    acidental: pac * g,
  });
  return {
    versao: 3,
    nome: "IDX",
    norma: "nb1-78",
    modoCalculo: "original",
    materiais: materiaisPadrao("nb1-78"),
    parametrosViga: { viga: { acidentais: true } },
    pavimentos: [
      {
        id: "pav",
        nome: "Pavimento 1",
        peDireito: 3,
        repeticoes: 1,
        lajes: [],
        pilaresRemovidos: [],
        pilares: [
          pilar("P1", 0, 0),
          pilar("P2", 4, 0),
          pilar("P3", 0, -5),
          pilar("PX", 3, -5),
          pilar("P4", 8, -5),
        ],
        vigas: [
          {
            id: "V20",
            nome: "V20",
            x1: 0,
            y1: 0,
            x2: 4,
            y2: 0,
            bw: 20,
            h: 50,
            cargaLinear: 0,
            somenteCargasProprias: true,
            inercias: [1],
            cargas: [dist(0, 0, 4, 0.3)],
          },
          {
            id: "V21",
            nome: "V21",
            x1: 0,
            y1: -5,
            x2: 8,
            y2: -5,
            bw: 20,
            h: 50,
            cargaLinear: 0,
            somenteCargasProprias: true,
            inercias: [1, 1],
            apoiosDesconsiderados: [1],
            cargas: [
              dist(0, 0, 3, 0.2),
              dist(1, 0, 2.5, 0.2),
              { tipo: "reacao", trecho: 1, posicao: 2.5, viga: "V20", apoio: 1 },
              dist(1, 2.5, 5, 0.2),
            ],
          },
        ],
      },
    ],
  };
}

describe("retrad_viga_x1: carga indexada e pilares da opção 7", () => {
  const c = caso("x1");

  it("opção 2: a V21 com a reação da V20 em D = 2,5 (carga indexada), todos os valores impressos", () => {
    const r = calcularObraSistrut(obraX1(), { modo: "original" });
    expect(r.pavimentos[0]!.naoProcessadas).toEqual([]);
    const { difere, faltando, conferidos } = confere(r, c, (id) => id.startsWith("op2."));
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
    expect(conferidos).toBe(c.valores.filter((v) => v.id.startsWith("op2.")).length);
  });

  it(".VIG com a marca da indexada (F = 1,01, Fac = −100) gerado sem planta: vira a carga indexada e dá a opção 2", () => {
    const g = KN_POR_TF;
    void g;
    const vigX1: RegistroTeste[] = [
      {
        nome: "V20",
        trechos: [
          { vao: 0, j: 1, divs: [] },
          { vao: 4, j: 1, divs: [[1, 4, 0, 0.3, 0]] },
          { vao: 0, j: 0, divs: [] },
        ],
      },
      {
        nome: "V21",
        trechos: [
          { vao: 0, j: 1, divs: [] },
          { vao: 3, j: 1, divs: [[1, 3, 0, 0.2, 0]] },
          {
            vao: 5,
            j: 1,
            divs: [
              [1, 2.5, 1.01, 0.2, -100],
              [1, 5, 0, 0.2, 0],
            ],
          },
          { vao: 0, j: 0, divs: [] },
        ],
      },
    ];
    const imp = importa([vig(vigX1)]);
    const v21 = imp.obra.pavimentos[0]!.vigas.find((v) => v.nome === "V21")!;
    expect(v21.cargas!.filter((x) => x.tipo === "reacao")).toEqual([
      { tipo: "reacao", trecho: 1, posicao: 2.5, viga: "V20", apoio: 1 },
    ]);
    const r = calcularObraSistrut(comParametros(imp.obra, { acidentais: true }), {
      modo: "original",
    });
    const { difere, faltando } = confere(r, c, (id) => id.startsWith("op2."));
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
  });

  it("opção 7: o IDX.VIG regravado (J com os números 1, 2 / 3, *, 4) e o IDX.REP linha a linha", () => {
    const imp = importa([arquivo(`${X1}/IDX.VIG`)]);
    const obra = comParametros(imp.obra, { acidentais: true });
    const r = calcularObraSistrut(obra, { modo: "original" });
    const { difere, faltando } = confere(r, c, (id) => id.startsWith("op7."));
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
    const gravado = readFileSync(arquivoOraculo(`${X1}/IDX.REP`), "latin1")
      .split(/\r\n/)
      .slice(9)
      .filter((l) => l !== "");
    const linhas = linhasArquivoRep(
      r.pavimentos[0]!.rep,
      { obra: "IDX", registros: "1 A 2", data: "", hora: "" },
      r.parametros.viga,
    ).slice(9);
    expect(linhas.map((l) => l.trimEnd())).toEqual(gravado.map((l) => l.trimEnd()));
  });
});

describe("retrad_viga_a1: vigas digitadas sem a marca no J (NOVA.VIG)", () => {
  it("todos os valores impressos; pilares sem número ficam <viga>.A<k>", () => {
    const c = caso("a1");
    const imp = importa([arquivo(`${A1}/NOVA.VIG`)]);
    expect(imp.obra.pavimentos[0]!.pilares.map((p) => p.nome)).toContain("V10.A0");
    const r = calcularObraSistrut(imp.obra, { modo: "original" });
    const { difere, faltando, conferidos } = confere(r, c, () => true);
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
    expect(conferidos).toBe(c.valores.length);
  });
});

describe("retrad_viga_c1: opção 7 sobre o E2E.VIG regravado", () => {
  it("V2 (apoio 0 desconsiderado), V4 e V5 com redução 85 %, acidentais S geradas 25 %, Mext, reação máxima", () => {
    const c = caso("c1");
    const imp = importa([arquivo(`${C1}/E2E.VIG`)]);
    const v2 = imp.obra.pavimentos[0]!.vigas.find((v) => v.nome === "V2")!;
    expect(v2.apoiosDesconsiderados).toEqual([0]);
    const r = calcularObraSistrut(comParametros(imp.obra, c.parametros), { modo: "original" });
    const { difere, faltando, conferidos } = confere(r, c, (id) => !id.startsWith("VA1"));
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
    expect(conferidos).toBeGreaterThan(80);
  });
});

describe("repetições por viga (.TAB) e DESENHO.INI", () => {
  const V1: RegistroTeste = {
    nome: "V1",
    trechos: [
      { vao: 0, j: 1.00001, divs: [] },
      { vao: 4, j: 1.00002, divs: [[1, 4, 0, 0, 0]] },
      { vao: 0, j: 0, divs: [] },
    ],
  };
  /** .TAB com rept 3 para a V1 (A_1CEC(0), DESINIT.BAS:764). */
  const tab = () => {
    const b = Buffer.alloc(70);
    b.write("~V1".padEnd(10), 0, "latin1");
    b.writeFloatLE(3, 10);
    return { nome: "TST.TAB", dados: new Uint8Array(b) };
  };

  it("o rept do .TAB vira as repetições da viga, e o resumo do DESENHO multiplica por elas (DESENHO.BAS:2279-2280)", () => {
    expect(lerTab(tab().dados)).toEqual([{ nome: "V1", repeticoes: 3 }]);
    const um = importa([vig([V1])]);
    const tres = importa([vig([V1]), tab()]);
    expect(tres.obra.pavimentos[0]!.vigas[0]!.repeticoes).toBe(3);
    const q1 = calcularObraSistrut(um.obra, { modo: "original" }).quadros[0]!;
    const r3 = calcularObraSistrut(tres.obra, { modo: "original" });
    expect(r3.quadros[0]!.repeticoes).toBe(3);
    // CINT(3·cm/100) por bitola (DESENHO.BAS:2279-2310)
    expect(r3.resumoVigas.comprimentoPorBitola).toEqual(
      q1.comprimentoPorBitola.map((c) => qbCint((3 * c) / 100)),
    );
  });

  it("DESENHO.INI: os de fábrica dão 1 e 1; coeficiente de medida 2 entra no .DSP da obra", () => {
    const fabrica = readFileSync(arquivoOraculo(`${ORIG}/DESENHO.INI`), "latin1");
    expect(lerDesenhoIni(fabrica)).toEqual({
      parametrizacao: "SISTRUT",
      coeficienteMedida: 1,
      coeficienteForca: 1,
    });
    expect(
      importa([vig([V1]), { nome: "DESENHO.INI", dados: new TextEncoder().encode(fabrica) }]).obra
        .parametrosViga,
    ).toBeUndefined();
    const linhas = fabrica.split("\r\n");
    linhas[7] = linhas[7]!.replace(/^1=/, "2=");
    const r = importa([
      vig([V1]),
      { nome: "DESENHO.INI", dados: new TextEncoder().encode(linhas.join("\r\n")) },
    ]);
    expect(r.obra.parametrosViga?.dsp).toEqual({ coeficienteMedida: 2 });
  });
});

describe("número de pilar da opção 7 diferente do da planta", () => {
  it("o J da V1 com 5 no apoio 0 (no lugar do P7): pilaresNoRep e a parcela da V1 vai ao P5 no .REP", () => {
    const b = new Uint8Array(readFileSync(arquivoOraculo(`${CASO_A}/E2E.VIG`)));
    const regs = lerVig(b);
    const i = regs.findIndex((r) => r.nome === "V1");
    // J do trecho 0 do registro i + 2 (o 1 é o cabeçalho): INT(J·100)/100 + 5/100000
    new DataView(b.buffer).setFloat32((i + 1) * 855 + 43, Math.fround(1.00005), true);
    const r = importa([{ nome: "E2E.VIG", dados: b }], obraE2E("original"));
    const v1 = r.obra.pavimentos[0]!.vigas.find((v) => v.nome === "V1")!;
    expect(v1.pilaresNoRep).toEqual([5, 8, 9]);
    const rep = calcularObraSistrut(r.obra, { modo: "original" }).pavimentos[0]!.rep;
    expect(rep.find((l) => l.pilar === "P5")!.parcelas.map((p) => p.viga)).toContain("V1");
    expect(rep.find((l) => l.pilar === "P7")!.parcelas.map((p) => p.viga)).not.toContain("V1");
  });
});

describe("item 6: a montagem da obra importada do .LAJ grava o .VIG do LAJEMONT bit a bit", () => {
  it.each([
    [
      "E2E",
      `${CASO_A}/E2E.LAJ`,
      `${CASO_A}/E2E.VIG`,
      { secaoVigas: { bw: 12, h: 40 }, vigas: { V4: { h: 50 }, V5: { h: 50 }, V6: { h: 50 } } },
    ],
    ["VBX", `${VBX}/VBX.LAJ`, `${VBX}/VBX.VIG`, { secaoVigas: { bw: 12, h: 50 } }],
  ] as const)("%s: P, Pac, D e vão de toda divisão iguais ao .VIG", (_n, laj, vigF, opcoes) => {
    const imp = importarLaj(readFileSync(arquivoOraculo(laj), "latin1"), opcoes);
    if (!imp.ok) throw new Error(imp.erros.join("\n"));
    const regs = lerVig(new Uint8Array(readFileSync(arquivoOraculo(vigF))));
    const montagem = calcularObraSistrut(imp.obra, { modo: "original" }).pavimentos[0]!.montagem
      .vigas;
    const trechos = (d: ReturnType<typeof dadosDoRegistro>) =>
      [d.balancoEsquerdo, ...d.tramos, d.balancoDireito].flatMap((t) =>
        t ? [{ vao: t.vao, divs: t.divisoes.map((x) => [x.p, x.pAcidental, x.d]) }] : [],
      );
    for (const reg of regs) {
      const m = montagem.find((x) => x.nome === reg.nome)!;
      expect(trechos(m), reg.nome).toEqual(
        trechos(
          dadosDoRegistro(
            reg,
            regs.map((x) => x.nome),
          ),
        ),
      );
    }
  });
});

describe("armadura digitada no DESDIM pela obra (motor → DESDIM → DESINIT)", () => {
  /** V1 de 2 tramos de 4 m com 2 t/m nos pilares 7, 8, 9 (20 × 50 sem .SEC). */
  const V1: RegistroTeste = {
    nome: "V1",
    trechos: [
      { vao: 0, j: 1.00007, divs: [] },
      { vao: 4, j: 1.00008, divs: [[2, 4, 0, 0, 0]] },
      { vao: 4, j: 1.00009, divs: [[2, 4, 0, 0, 0]] },
      { vao: 0, j: 0, divs: [] },
    ],
  };
  const base = importa([vig([V1])]).obra;
  const com = (armaduraDigitada: ArmaduraDigitada[]) => {
    const o = structuredClone(base);
    o.pavimentos[0]!.vigas[0]!.armaduraDigitada = armaduraDigitada;
    return calcularObraSistrut(o, { modo: "original" }).pavimentos[0]!.vigas[0]!;
  };
  const sem = calcularObraSistrut(base, { modo: "original" }).pavimentos[0]!.vigas[0]!;

  it("apoio 1 com bitola 16 e Enter: ⌈As/2,0⌉ barras de 16; o detalhamento passa a ter a negativa de 16", () => {
    const as = sem.dimensionamento!.apoios[1]!.as;
    const v = com([{ em: "apoio", numero: 1, tracionada: { bitola: 16 } }]);
    const n = Math.ceil(as / 2) + (Math.floor(as / 2) === 0 ? 1 : 0);
    expect(v.dimensionamento!.apoios[1]!.arranjo).toBe(`${n}#16`);
    expect(v.avisos).toEqual([]);
    const negativas = (x: typeof v) =>
      x
        .detalhamento!.posicoes.filter((p) => p.tipo === "negativa")
        .map((p) => Math.round(p.bitola * 10) / 10);
    expect(negativas(v)).toContain(16);
    expect(negativas(sem)).not.toContain(16);
  });

  it("a comprimida digitada chega ao DESINIT (a do apoio 1 vira 2#10)", () => {
    const v = com([{ em: "apoio", numero: 1, comprimida: "2#10" }]);
    expect(v.dimensionamento!.apoios[1]!.arranjoCompressao).toBe("2#10");
    expect(v.detalhamento!.posicoes).not.toEqual(sem.detalhamento!.posicoes);
  });
});

describe('"Continuo com o processamento desta Viga" (DESDIM.BAS:3062-3080)', () => {
  /** 20 t/m em 2 tramos de 4 m, 20 × 50: τwd = V/(bw·d)·γf ≈ 50/(20·46)·1,4·1000 = 76 t/m²
   *  > 0,25·fcd = 250·0,15/1,4 = 26,8 (DESDIM.BAS:2984-2988). */
  const V9: RegistroTeste = {
    nome: "V9",
    trechos: [
      { vao: 0, j: 1.00001, divs: [] },
      { vao: 4, j: 1.00002, divs: [[20, 4, 0, 0, 0]] },
      { vao: 4, j: 1.00003, divs: [[20, 4, 0, 0, 0]] },
      { vao: 0, j: 0, divs: [] },
    ],
  };
  const obra = importa([vig([V9])]).obra;
  const roda = (o: Obra, modo: "original" | "corrigido") => {
    const r = calcularObraSistrut(o, { modo });
    return { r, v: r.pavimentos[0]!.vigas[0]! };
  };

  it('padrão "N" no modo original: a viga para com a tela do DESDIM; sem detalhamento, quadro nem resumo', () => {
    const { r, v } = roda(obra, "original");
    expect(v.dimensionamento!.limitesExcedidos).toContain("cisalhamento");
    expect(v.interrompida).toEqual({
      motivos: v.dimensionamento!.limitesExcedidos,
      impressa: true,
      aviso: v.avisos.at(-1),
    });
    expect(v.detalhamento).toBeUndefined();
    expect(v.quadro).toBeUndefined();
    expect(r.quadros).toEqual([]);
    expect(r.resumoVigas.porViga).toEqual([]);
    // o aviso diz em pt-BR o que marcar na tela, com id estável; a tela do DESDIM vai
    // para a memória do pavimento
    expect(v.avisos.at(-1)).toBe(
      `${v.nome}: tensão de cisalhamento acima do limite e momento acima de 40 % do limite da armadura simples. Como no original com a resposta padrão "N", a viga parou no dimensionamento, sem detalhamento nem quadro de ferros. Para seguir, marque "Continuar mesmo acima do limite" na viga.`,
    );
    expect(r.avisosComOpcao).toEqual([
      {
        id: "viga.continuar-acima-do-limite",
        pavimentoId: r.pavimentos[0]!.pavimentoId,
        elemento: { tipo: "viga", id: v.id },
        texto: v.avisos.at(-1),
      },
    ]);
    const tela = r.pavimentos[0]!.memoria.find((m) => m.ref === "DESDIM.BAS:3062-3080");
    expect(tela?.descricao).toContain("Atencao !!! Tensao de Cisalhamento acima do Limite.");
    expect(tela?.descricao).toContain("Continuo com o processamento desta Viga  S/*N*");
  });

  it('com a resposta "S" (continuaSeExcederLimite) a viga segue até o DESINIT e o quadro', () => {
    const o = structuredClone(obra);
    o.pavimentos[0]!.vigas[0]!.continuaSeExcederLimite = true;
    const { r, v } = roda(o, "original");
    expect(v.interrompida).toBeUndefined();
    expect(v.detalhamento).toBeDefined();
    expect(r.quadros.map((q) => q.nome)).toEqual(["V9"]);
  });

  it("modo corrigido: segue, com o aviso do cisalhamento", () => {
    const { v } = roda(obra, "corrigido");
    expect(v.interrompida).toBeUndefined();
    expect(v.detalhamento).toBeDefined();
    expect(
      v.dimensionamento!.avisos.some((a) => a.includes("tensão de cisalhamento acima do limite")),
    ).toBe(true);
  });

  it("quantitativos: a viga que para entra pela estimativa da V2, não com aço 0", () => {
    // modo original, sem `continuaSeExcederLimite`: V9 sem quadro do DESINIT
    const o = structuredClone(obra);
    o.modoCalculo = "original";
    const r = calcularObra(o, nb178);
    const q = calcularQuantitativos(o, r);
    expect(r.sistrut!.pavimentos[0]!.vigas[0]!.quadro).toBeUndefined();
    expect(q.pavimentos[0]!.vigasSemDesinit).toEqual(["V9"]);
    expect(q.fonte.vigas.aco).toBe("misto");
    expect(q.memoria.some((m) => m.descricao.includes("as vigas sem quadro do DESINIT"))).toBe(
      true,
    );
    // a estimativa conta as barras longitudinais da V9 (2 tramos × 86,16 kg) e nenhum
    // estribo: com o cisalhamento acima do limite o DESDIM não adota estribo ("*"), e a
    // viga sai marcada com o aço incompleto
    expect(q.vigas.aco).toBeGreaterThan(0);
    expect(q.acoIncompleto).toContain("V9");
    expect(q.avisos.some((x) => x.includes("V9 tramo 1: sem estribo adotado"))).toBe(true);
    // com a resposta "S" a mesma viga tem quadro, e o aço é o do DESINIT
    const s = structuredClone(o);
    s.pavimentos[0]!.vigas[0]!.continuaSeExcederLimite = true;
    const qs = calcularQuantitativos(s, calcularObra(s, nb178));
    expect(qs.fonte.vigas.aco).toBe("sistrut");
    expect(qs.acoIncompleto).not.toContain("V9");
  });

  it("com a verificação de fissuração, a passada que para não imprime (V_187a = 0)", () => {
    const o = structuredClone(obra);
    o.parametrosViga = { dsp: { verificaFissuracao: true } };
    expect(roda(o, "original").v.interrompida?.impressa).toBe(false);
  });
});

describe("peso próprio das vigas tirado do .VIG (o .LAJ não grava o peso do LAJEMONT)", () => {
  // o E2E do caso_a_laje foi montado com V1-V3 12 × 40 e V4-V6 12 × 50: 0,12 e 0,15 t/m
  // (bw·h·2,5 t/m³). A obra do .LAJ com vigas 20 × 50 monta com 0,25 t/m; completada
  // pelo E2E.VIG, cada viga recebe o peso do .VIG e nenhuma vira "cargas diferentes".
  const imp = importarLaj(readFileSync(arquivoOraculo(`${CASO_A}/E2E.LAJ`), "latin1"), {
    secaoVigas: { bw: 20, h: 50 },
  });
  if (!imp.ok) throw new Error(imp.erros.join("\n"));
  const vigF = new Uint8Array(readFileSync(arquivoOraculo(`${CASO_A}/E2E.VIG`)));
  const r = importa([{ nome: "E2E.VIG", dados: vigF }], imp.obra);
  const vigas = r.obra.pavimentos[0]!.vigas;

  it("V1-V3 com 120 kg/m e V4-V6 com 150 kg/m, sem aviso de cargas diferentes", () => {
    const kg = (nome: string) =>
      Math.round((vigas.find((v) => v.nome === nome)!.pesoProprio! / KN_POR_TF) * 1000);
    expect(["V1", "V2", "V3", "V4", "V5", "V6"].map(kg)).toEqual([120, 120, 120, 150, 150, 150]);
    expect(vigas.some((v) => v.somenteCargasProprias)).toBe(false);
    expect(r.avisos.filter((a) => /diferentes das da montagem/.test(a))).toEqual([]);
    expect(r.avisos).toContain(
      "Peso próprio de 120 kg/m nas vigas V1, V2, V3, tirado das cargas do .VIG: o .LAJ não grava o peso que o usuário digita no LAJEMONT.",
    );
  });

  it("com o peso do .VIG, a montagem grava de novo o .VIG do LAJEMONT bit a bit", () => {
    const regs = lerVig(vigF);
    const montagem = calcularObraSistrut(r.obra, { modo: "original" }).pavimentos[0]!.montagem
      .vigas;
    const ps = (d: ReturnType<typeof dadosDoRegistro>) =>
      [d.balancoEsquerdo, ...d.tramos, d.balancoDireito].flatMap((t) =>
        t ? t.divisoes.map((x) => [x.p, x.pAcidental, x.d]) : [],
      );
    for (const reg of regs)
      expect(ps(montagem.find((x) => x.nome === reg.nome)!), reg.nome).toEqual(
        ps(
          dadosDoRegistro(
            reg,
            regs.map((x) => x.nome),
          ),
        ),
      );
  });

  it("a mesma seção da montagem do original: nenhum peso gravado", () => {
    const igual = importarLaj(readFileSync(arquivoOraculo(`${CASO_A}/E2E.LAJ`), "latin1"), {
      secaoVigas: { bw: 12, h: 40 },
      vigas: { V4: { h: 50 }, V5: { h: 50 }, V6: { h: 50 } },
    });
    if (!igual.ok) throw new Error(igual.erros.join("\n"));
    const s = importa([{ nome: "E2E.VIG", dados: vigF }], igual.obra);
    expect(s.obra.pavimentos[0]!.vigas.map((v) => v.pesoProprio)).toEqual(Array(6).fill(undefined));
    expect(s.avisos.filter((a) => /Peso próprio/.test(a))).toEqual([]);
  });
});

describe("vários .DSP no importador de vigas", () => {
  const dsp = (nome: string) => ({ nome, dados: arquivo(`${ORIG}/SISTRUT.DSP`).dados });
  const desenho = {
    nome: "DESENHO.INI",
    dados: new Uint8Array(readFileSync(arquivoOraculo(`${ORIG}/DESENHO.INI`))),
  };

  it("vale o da parametrização padrão do DESENHO.INI (SISTRUT), com aviso", () => {
    const r = importa([vig([V1]), dsp("A.DSP"), dsp("SISTRUT.DSP"), desenho]);
    expect(r.avisos).toContain(
      "Mais de um .DSP (A.DSP, SISTRUT.DSP): valeu o SISTRUT.DSP, a parametrização padrão do DESENHO.INI.",
    );
  });

  it("sem DESENHO.INI, o primeiro, com aviso", () => {
    const r = importa([vig([V1]), dsp("A.DSP"), dsp("B.DSP")]);
    expect(r.avisos).toContain("Mais de um .DSP (A.DSP, B.DSP): valeu o A.DSP, o primeiro.");
  });
});
