// De ponta a ponta: a obra E2E montada como obra da V2 (`__e2e__/obraE2E.ts`) passa por
// `calcularObraSistrut` no modo original e reproduz os números impressos pelo SISTRUT
// 4.0 nos casos a, b e c do oráculo:
// - caso a (LAJECALC + LAJEGEOM 7): oraculo/runs/caso_a_laje-20261015-041425
// - caso b (VIGA opção 7 sobre o E2E.VIG do caso a): oraculo/runs/caso_b_viga-20261014-182718
// - caso c (PILAREDI, P5): oraculo/runs/caso_c_pilaredi-20261015-041842
// - LAJEPROC sobre a mesma obra (tela da L1): oraculo/runs/retrad_lajeproc-20261015-082452
// E a obra VBX (`__e2e__/obraVBX.ts`) do caso v2par_viga_fluxo (viga sobre as pontas de
// dois balanços, carga indexada, .REP com parcelas truncadas):
// oraculo/runs/v2par_viga_fluxo-20261015-164332
// Esperado = texto impresso (meia unidade da última casa, ou FIX onde o original trunca).
// Os ids que o motor não produz estão em NAO_PRODUZIDOS, com o motivo.
import { describe, expect, it } from "vitest";
import { bateComImpresso, CASOS_ORACULO, type CasoOraculo } from "./__oraculo__/index";
import { obraE2E } from "./__e2e__/obraE2E";
import { obraVBX } from "./__e2e__/obraVBX";
import vigaFluxo from "./lajes/__casos_t2__/v2par_viga_fluxo.json";
import { calcularObraSistrut, type ResultadoSistrut } from "./obra";
import { textoMep } from "./vigas/vicalc";

const original = calcularObraSistrut(obraE2E("original"), { modo: "original" });
const corrigido = calcularObraSistrut(obraE2E("corrigido"), { modo: "corrigido" });
const vbx = calcularObraSistrut(obraVBX("original"), { modo: "original" });
const casoVigaFluxo: CasoOraculo = vigaFluxo;

/** Ids do oráculo que o motor não calcula, e por quê. */
const NAO_PRODUZIDOS: [RegExp, string][] = [
  [/^L\d\.H\.(mom|arm)(\.preOtim)?$/, "eco do H impresso no cabeçalho da opção 5"],
  // a obra E2E não liga `parametrosPilar.predimensionamento`; com ele, os P5.pre.* são
  // conferidos em pilaresDaObra.test.ts
  [/^P5\.pre\./, "predimensionamento (PILAREDI 3.1) desligado na obra E2E"],
];

type Valor = number | string | undefined;

function laje(r: ResultadoSistrut, id: string): Valor {
  const p = r.pavimentos[0]!;
  const m = /^(L\d)\.(.+)$/.exec(id);
  if (!m) return undefined;
  const [, nome = "", resto = ""] = m;
  const pre = /\.(preOtim|antesOtim)$/.test(resto);
  const campo = resto.replace(/\.(preOtim|antesOtim)$/, "");
  const esf = pre ? p.esforcosAntesOtimizacao : p.esforcos;
  const mom = esf.momentos[nome];
  const arm = (pre ? p.armadurasAntesOtimizacao : p.armaduras)[nome];
  const esp = p.espessuras[nome];
  const lajeS = esf.lajes.find((l) => l.nome === nome);
  const prep = esf.preparadas[nome];
  const espOk = esp?.ok ? esp : undefined;
  const barra = (b: { ok: boolean } & Partial<{ bitola: number; espacamento: number }>) =>
    b.ok ? b : undefined;
  const mapa: Record<string, Valor> = {
    "M+princ": mom && mom.mPositivoPrincipalTcm / 100,
    "M+sec": mom && mom.mPositivoSecundarioTcm / 100,
    "M-maior": mom && mom.mNegativoMaiorTcm / 100,
    "M-menor": mom && mom.mNegativoMenorTcm / 100,
    "As+princ": arm?.asPositivaPrincipal,
    "As+sec": arm?.asPositivaSecundaria,
    "As-maior": arm?.asNegativaMaior,
    "As-menor": arm?.asNegativaMenor,
    H: lajeS?.h,
    "x/d": arm?.xd,
    "As.phi": arm && barra(arm.barra)?.bitola,
    "As.s": arm && barra(arm.barra)?.espacamento,
    pp: mom?.pesoProprio,
    p: mom?.q,
    "L/f": 0,
    perm: lajeS?.cargaPermanente,
    acid: prep && prep.cargaArea / prep.area,
    Hmin: espOk?.h,
    "Hmin.x/d": espOk?.xd,
    "Hmin.As.phi": espOk && barra(espOk.barra)?.bitola,
    "Hmin.As.s": espOk && barra(espOk.barra)?.espacamento,
    "Hmin.pp": espOk?.pesoProprio,
    "Hmin.p": espOk?.q,
    "Hmin.L/f": espOk ? (espOk.flecha?.flecha ?? 0) : undefined,
    "Hmin.perm": lajeS?.cargaPermanente,
    "Hmin.acid": prep && prep.cargaArea / prep.area,
    mu: lajeS?.mu,
  };
  return mapa[campo];
}

/** Barras do LAJEPROC (`L1.As+princ.phi`, `L1.As-maior.s`): positivas da laje e as
 *  negativas das continuidades dela, a de maior M− primeiro. */
function barrasLajeproc(r: ResultadoSistrut, id: string): Valor {
  const m = /^(L\d)\.As([+-])(princ|sec|maior|menor)\.(phi|s)$/.exec(id);
  if (!m) return undefined;
  const [, nome = "", , pos, campo] = m;
  const proc = r.pavimentos[0]!.lajeproc;
  const positiva = proc.positivas[nome];
  const negativas = proc.negativas
    .filter((n) => n.continuidade.lajeA === nome || n.continuidade.lajeB === nome)
    .sort((a, b) => b.mTcm - a.mTcm);
  const posicao =
    pos === "princ"
      ? positiva?.principal
      : pos === "sec"
        ? positiva?.secundaria
        : negativas[pos === "maior" ? 0 : 1];
  const b = posicao?.barra;
  if (!b?.ok) return undefined;
  return campo === "phi" ? b.bitola : b.espacamento;
}

/** Texto curto da barra ("#6.3c/20") como o JSON do v2par_viga_fluxo anota. */
const textoCurto = (b: { ok: boolean } & Partial<{ bitola: number; espacamento: number }>) =>
  // bitola e espaçamento em SINGLE no original: 1 casa, como impresso
  b.ok ? `#${Number(b.bitola?.toFixed(1))}c/${Number(b.espacamento?.toFixed(1))}` : "NAO";

/** Barras do LAJEPROC em texto (`L1.proc.posPrinc`, `L1-L2.proc.neg`). */
function textoLajeproc(r: ResultadoSistrut, id: string): Valor {
  const proc = r.pavimentos[0]!.lajeproc;
  const pos = /^(L\d)\.proc\.pos(Princ|Sec)$/.exec(id);
  if (pos) {
    const p = proc.positivas[pos[1] ?? ""];
    const b = pos[2] === "Princ" ? p?.principal.barra : p?.secundaria.barra;
    return b && textoCurto(b);
  }
  const neg = /^(L\d)-(L\d)\.proc\.neg$/.exec(id);
  if (!neg) return undefined;
  const n = proc.negativas.find(
    (x) =>
      (x.continuidade.lajeA === neg[1] && x.continuidade.lajeB === neg[2]) ||
      (x.continuidade.lajeA === neg[2] && x.continuidade.lajeB === neg[1]),
  );
  return n && textoCurto(n.barra);
}

/** Código do lado k do original (`L1.lado3.codigo`): o lado é achado pela geometria
 *  gravada pelo original (entrada do caso), porque o polígono da V2 pode começar em
 *  outro vértice. */
function codigoDoLado(r: ResultadoSistrut, caso: CasoOraculo, id: string): Valor {
  const m = /^(L\d)\.lado(\d+)\.codigo$/.exec(id);
  if (!m) return undefined;
  const obra = (
    caso.entrada as {
      obra?: {
        obra_gravada_pelo_original?: {
          lajes?: Record<string, { lados: { lado: number; de: number[]; para: number[] }[] }>;
        };
      };
    }
  ).obra;
  const lado = obra?.obra_gravada_pelo_original?.lajes?.[m[1] ?? ""]?.lados.find(
    (l) => l.lado === Number(m[2]),
  );
  const laje = r.pavimentos[0]!.esforcos.lajes.find((l) => l.nome === m[1]);
  if (!lado || !laje) return undefined;
  const igual = (p: { x: number; y: number }, q: number[]) => p.x === q[0] && p.y === q[1];
  const k = laje.vertices.findIndex((v, i) => {
    const w = laje.vertices[(i + 1) % laje.vertices.length]!;
    return (igual(v, lado.de) && igual(w, lado.para)) || (igual(w, lado.de) && igual(v, lado.para));
  });
  return k < 0 ? undefined : laje.codigos[k];
}

function reacao(r: ResultadoSistrut, id: string): Valor {
  const m = /^(L\d)>(V\d)\.(\w+)$/.exec(id);
  if (!m) return undefined;
  const [, l, v, campo] = m;
  const reac = r.pavimentos[0]!.montagem.reacoes.find(
    (x) => x.laje === l && x.apoio.tipo === "viga" && x.apoio.viga === v,
  );
  if (!reac) return undefined;
  const mapa: Record<string, number> = {
    area: reac.area,
    qArea: reac.cargaArea,
    qEstru: reac.estrutura,
    qPeso: reac.peso,
    qLinear: reac.linear,
  };
  return mapa[campo ?? ""];
}

function totais(r: ResultadoSistrut, id: string): Valor {
  const tt = r.pavimentos[0]!.montagem.totais;
  const mapa: Record<string, number> = {
    "total.cargasArea": tt.cargasPorAreaNominal,
    "total.cargasAreaConsiderado": tt.cargasPorArea,
    "total.ppVigas": tt.pesoProprioVigas,
    "total.ppLajes": tt.pesoProprioLajes,
    "total.estrutura": tt.estrutura,
    "total.painel": tt.painel,
    "total.vigas": tt.vigas,
    "total.pilares": tt.pilares,
    "total.vigasPilares": tt.vigas + tt.pilares,
    "param.fck": r.materiais.fck,
    "param.fyk": r.materiais.fyk,
    "param.cobrimento": r.parametros.laje.cobrimento,
    "param.cse": r.materiais.gamaF,
    "param.csc": r.materiais.gamaC,
    "param.csa": r.materiais.gamaS,
  };
  return mapa[id];
}

function viga(r: ResultadoSistrut, id: string): Valor {
  const p = r.pavimentos[0]!;
  const m = /^(V\d)\.(.+)$/.exec(id);
  if (!m) return undefined;
  const [, nome, resto = ""] = m;
  const a = p.analises.find((x) => x.nome === nome);
  const dados = p.vigasVig.find((x) => x.nome === nome);
  const mont = p.montagem.vigas.find((x) => x.nome === nome);
  if (!a || !dados || !mont) return undefined;
  if (resto === "somaR") return a.somaReacoes;
  // MEP e parcelas do .REP: o texto do original (STR$ do piso em 2 casas)
  if (resto === "MEP0") return textoMep(a.mepEsquerdo, r.modo);
  if (resto === `MEP${a.tramos.length}`) return textoMep(a.mepDireito, r.modo);
  const ap = /^a(\d+)\.(M-|R)$/.exec(resto);
  if (ap) {
    const apoio = a.apoios[Number(ap[1])];
    return ap[2] === "R" ? apoio?.r : apoio?.m;
  }
  const ep = /^t(\d+)\.EEP\.(\w+\+?)$/.exec(resto);
  if (ep) {
    const linha = a.engastamentoPerfeito.find((e) => e.tramo === Number(ep[1]));
    const mapa: Record<string, Valor> = {
      Ve: linha?.ve,
      x: linha?.x,
      "M+": linha?.mPositivo,
      Vd: linha?.vd,
    };
    return mapa[ep[2] ?? ""];
  }
  const tr = /^t(\d+)\.(\w+\+?)$/.exec(resto);
  if (!tr) return undefined;
  const k = Number(tr[1]);
  // balanços: o VIGA imprime o direito como tramo n + 1 e o esquerdo como 0
  const n = a.tramos.length;
  if (k === n + 1 && tr[2] === "Ve") return a.balancoDireito?.carga;
  if (k === 0 && tr[2] === "Vd") return a.balancoEsquerdo?.carga;
  const t = a.tramos[k - 1];
  const td = k === n + 1 ? dados.balancoDireito : dados.tramos[k - 1];
  const div = td?.divisoes[0];
  const alv = mont.alvenariasSobreViga?.find((x) => x.tramo === k);
  const mapa: Record<string, Valor> = {
    Ve: t?.ve,
    x: t?.x,
    "M+": t?.mPositivo,
    Vd: t?.vd,
    fEJ: t?.fEJ,
    P: div?.p,
    L: td?.vao,
    J: td?.inercia,
    D: div?.d,
    F: div?.f,
    pp: alv?.peso,
    ppViga: alv?.peso,
    alv: alv?.alvenaria,
  };
  return mapa[tr[2] ?? ""];
}

function rep(r: ResultadoSistrut, id: string): Valor {
  const m = /^REP(?:arq)?\.(P\d)(?:\.(carga|momento)\.(V\d))?$/.exec(id);
  if (!m) return undefined;
  const [, pilar, tipo, v] = m;
  const linha = r.pavimentos[0]!.rep.find((l) => l.pilar === pilar);
  if (!linha) return undefined;
  if (!tipo) return linha.total;
  if (tipo === "carga") return linha.parcelas.find((x) => x.viga === v)?.texto;
  return linha.momentos.find((x) => x.viga === v)?.texto;
}

function pilaredi(r: ResultadoSistrut, id: string): Valor {
  const m = /^P5\.(.+)$/.exec(id);
  if (!m) return undefined;
  const resto = m[1] ?? "";
  const lance = r.lances.find((l) => l.pilarId === "P5" && l.nivel === 0);
  const d = lance?.dimensionamento;
  if (!lance || !d) return undefined;
  const caso = /^(\d[ef])\.(.+)$/.exec(resto);
  if (caso) {
    const c = d.casos.find((x) => x.rotulo === caso[1]);
    if (!c) return undefined;
    const mapa: Record<string, number> = {
      Mkx: c.mx,
      Mky: c.my,
      Mktot: c.mTotal,
      MRx1a: c.mrx,
      MRx2a: c.m2x,
      MRy1a: c.mry,
      MRy2a: c.m2y,
      MRtot: c.mrTotal,
      incLN: c.anguloLN,
      "1/r": c.curvatura * 1000,
      "x/d": c.xd,
      defCon: c.deformacaoConcreto,
      defAco: c.deformacaoAco,
    };
    return mapa[caso[2] ?? ""];
  }
  const mapa: Record<string, Valor> = {
    lambdaX: d.lambdaX,
    lambdaY: d.lambdaY,
    Nk: lance.carga.nk,
    Mkxi: lance.carga.mkx,
    Mkyi: lance.carga.mky,
    cobrimento: r.parametros.pip.cobrimento,
    As: d.as,
    taxa: d.taxa,
    "barras.n": d.barras.length === 1 ? d.barras[0]?.quantidade : undefined,
    "barras.phi": d.barras.length === 1 ? d.barras[0]?.bitola : undefined,
    "estribo.phi": d.estribo.bitola,
    "estribo.s": d.estribo.espacamento,
    Bw: d.secao.tipo === "retangular" ? d.secao.b : undefined,
    Hw: d.secao.tipo === "retangular" ? d.secao.h : undefined,
    cargaREP: r.pavimentos[0]!.rep.find((l) => l.pilar === "P5")?.total,
  };
  return mapa[resto];
}

const calculado = (r: ResultadoSistrut, id: string, caso: CasoOraculo) =>
  textoLajeproc(r, id) ??
  codigoDoLado(r, caso, id) ??
  barrasLajeproc(r, id) ??
  laje(r, id) ??
  reacao(r, id) ??
  totais(r, id) ??
  viga(r, id) ??
  rep(r, id) ??
  pilaredi(r, id);

function confereCaso(caso: CasoOraculo, r: ResultadoSistrut) {
  const faltando: string[] = [];
  const difere: string[] = [];
  let conferidos = 0;
  for (const v of caso.valores) {
    const motivo = NAO_PRODUZIDOS.find(([re]) => re.test(v.id));
    if (motivo) continue;
    const c = calculado(r, v.id, caso);
    if (c === undefined) {
      faltando.push(v.id);
      continue;
    }
    conferidos++;
    const ok = typeof c === "string" ? c.trim() === v.impresso.trim() : bateComImpresso(v, c);
    if (!ok) difere.push(`${v.id}: impresso ${v.impresso}, calculado ${c}`);
  }
  return { faltando, difere, conferidos };
}

describe("calcularObraSistrut, modo original, obra E2E", () => {
  it("sem avisos nem falhas no caminho", () => {
    expect(original.avisos).toEqual([]);
    const p = original.pavimentos[0]!;
    expect(p.avisos).toEqual([]);
    expect(p.montagem.avisos).toEqual([]);
    expect(p.naoProcessadas).toEqual([]);
    expect(p.vigas.flatMap((v) => v.avisos)).toEqual([]);
    expect(original.lances.flatMap((l) => l.avisos)).toEqual([]);
  });

  it.each(["caso_a_laje", "caso_b_viga", "caso_c_pilaredi", "retrad_lajeproc"])(
    "%s: todos os números impressos",
    (nome) => {
      const caso = CASOS_ORACULO[nome]!;
      const { faltando, difere, conferidos } = confereCaso(caso, original);
      expect(faltando, `ids sem cálculo no motor`).toEqual([]);
      expect(difere).toEqual([]);
      expect(conferidos).toBeGreaterThanOrEqual(Math.min(40, caso.valores.length));
    },
  );
});

describe("calcularObraSistrut, modo original, obra VBX (v2par_viga_fluxo)", () => {
  it("sem avisos; a V5 se apoia nas pontas dos balanços de V1 e V2", () => {
    expect(vbx.avisos).toEqual([]);
    const p = vbx.pavimentos[0]!;
    expect(p.avisos).toEqual([]);
    expect(p.naoProcessadas).toEqual([]);
    expect(p.eixos.find((e) => e.nome === "V5")?.apoios).toEqual([{ viga: "V2" }, { viga: "V1" }]);
  });

  it("todos os números impressos", () => {
    const { faltando, difere, conferidos } = confereCaso(casoVigaFluxo, vbx);
    expect(faltando, "ids sem cálculo no motor").toEqual([]);
    expect(difere).toEqual([]);
    expect(conferidos).toBeGreaterThan(200);
  });
});

describe("calcularObraSistrut, modo corrigido, obra E2E", () => {
  it("roda o mesmo caminho sem avisos", () => {
    expect(corrigido.avisos).toEqual([]);
    expect(corrigido.pavimentos[0]!.avisos).toEqual([]);
    expect(corrigido.lances.flatMap((l) => l.avisos)).toEqual([]);
  });
});

describe("Obra.otimizaNegativos (o passo opcional da opção 6 do LAJECALC)", () => {
  it("false: os esforços finais são os de antes da otimização, e as armaduras também", () => {
    const r = calcularObraSistrut(
      { ...obraE2E("original"), otimizaNegativos: false },
      { modo: "original" },
    );
    const p = r.pavimentos[0]!;
    expect(p.esforcos).toBe(p.esforcosAntesOtimizacao);
    expect(p.armaduras).toEqual(p.armadurasAntesOtimizacao);
  });
});
