// Caminho de cálculo do SISTRUT 4.0 para uma obra da V2 (NB-1/78), nos dois modos.
// Monta, a partir da obra, as entradas que o original lê (o .LAJ do LAJEGEOM, os
// eixos e pesos do LAJEMONT, o .VIG, o .REP, as colunas do PILGEEDI) e encadeia as
// famílias de `src/calculo/sistrut/`:
//
//   LAJECALC (continuidade, direção e μ, espessura mínima, imposição de H, momentos,
//   otimização dos negativos, armaduras) → LAJEPROC (barras) → LAJEMONT (reações e
//   .VIG) → VIGA (VICALC e .REP) → DESDIM/DESINIT (dimensionamento, detalhamento e
//   quadro da viga) → DESENHO (resumo) → PILGEEDI/PILAREDI (cargas e pilares).
//
// Tudo sai nas UNIDADES DO ORIGINAL (t, m, cm, t/cm², t·m, t·cm nos campos que dizem):
// quem converte para SI é `fluxo.ts` (base/unidades.ts). Ver docs/MODO-CALCULO.md.
//
// Entrada da V2 → original:
// - laje retangular → polígono horário a partir do canto inferior esquerdo; bordos
//   0 esquerdo, 1 superior, 2 direito, 3 inferior; vértices compartilhados pelo índice
//   (coordenada igual a 1e-4 m), como o LAJEGEOM;
// - revestimento → carga permanente (t/m²); sobrecarga → carga de ocupação por área
//   no polígono da laje, total = acidental (t/m²); h → imposição de H (LAJECALC 4);
// - μ = 1 (o padrão da V2) → μ pela relação das cordas (LAJECALC 2); outro valor →
//   μ informado;
// - vinculação forçada da V2: livre → código 1, apoiado → 0, engastado → 22; a
//   automática do original (lados com os mesmos dois vértices) vale nos outros bordos;
// - vigas: nós e apoios pela regra da V2 (`geometriaDasVigas`), eixo em ordem
//   crescente; peso próprio CINT(bw·h·densidade) em kg/m (valor predominante +
//   exceções); carga linear da viga → alvenaria sobre o eixo;
// - pilares: uma coluna por posição, do nível da fundação (cota 0) ao último
//   pavimento em que o pilar existe; o .REP de cada pavimento (e de cada repetição)
//   no seu nível; vínculo "continuidade" em todos os níveis.
//
// Materiais: original = fck nominal (MPa/100 → t/cm²: 15 MPa = 0,15 t/cm², o que o
// usuário do original digitava para 150 kgf/cm²), fyk pela categoria (CA-50 = 5 t/cm²),
// classe da obra, γ 1,4/1,4/1,15, densidade 2,5 t/m³, cobrimentos dos parâmetros
// "SISTRUT" (.LAP 1,5; .DSP 2,0 + 2,0; .PIP 2,0), Float32 por atribuição. Corrigido =
// SI convertido exato (fck/98,0665, 500 MPa → 5,0986 t/cm², 25 kN/m³ → 2,5493 t/m³),
// cobrimentos da obra, float64.
import type { Bordo, Laje, Materiais, Obra, Pavimento, Pilar, Vinculo } from "../../dominio/obra";
import { geometriaDasVigas, type GeometriaViga } from "../montagem";
import type { Etapa } from "../tipos";
import { atribuicao, ErroQB, sng } from "./base/f32";
import {
  emSingle,
  PARAMETROS_DSP,
  PARAMETROS_LAJE,
  PARAMETROS_PILAR,
  PARAMETROS_PIP,
  PARAMETROS_VIGA,
} from "./base/parametros";
import type {
  ArmadurasDeLaje,
  CargaPorArea,
  Continuidade,
  DadosViga,
  EixoViga,
  EntradaDesdim,
  EsforcosLajes,
  EspessuraDeLaje,
  FormaTramo,
  FormaViga,
  LajeSistrut,
  LeituraRep,
  MateriaisSistrut,
  ModoSistrut,
  PainelLajes,
  PesoProprioVigas,
  QuadroViga,
  ResultadoLajeproc,
  ResumoVigas,
  SecaoViga,
  SecoesViga,
} from "./base/tipos";
import {
  DENSIDADE_CONCRETO_TM3,
  FYK_CORRIGIDO_MPA,
  FYK_ORIGINAL_TCM2,
  knPorM2ParaTPorM2,
  knPorMParaTPorM,
  mpaParaTcm2,
  PESO_CONCRETO_CORRIGIDO_KNM3,
  KN_POR_TF,
} from "./base/unidades";
import { armadurasLaje } from "./lajes/armaduras";
import { continuidadeAutomatica } from "./lajes/continuidade";
import { esforcosDoPainelCom } from "./lajes/esforcos";
import { espessuraMinimaLaje, type DadosFlechaLaje } from "./lajes/espessura";
import { impoeEspessura, momentosComCoeficiente } from "./lajes/momentos";
import { otimizaNegativos } from "./lajes/otimizacao";
import { lajeproc } from "./lajes/proc";
import { montaPavimentoSistrut, type MontagemPavimentoSistrut } from "./montagem/reacoes";
import { pesoKgPorM } from "./montagem/vigas";
import { dimensionaPilarSistrut, type DimensionamentoPilarSistrut } from "./pilares/armadura";
import {
  cargasPilaresSistrut,
  type CargaPilarNivelSistrut,
  type ColunaEdificioSistrut,
} from "./pilares/carga";
import { quadroDaViga, resumoGeralVigas } from "./quant/vigas";
import { dimensionaVigaDesdim, type DimensionamentoDesdim } from "./vigas/desdim";
import { detalhaVigaDesinit, type ApoioFormaViga, type DetalhamentoDesinit } from "./vigas/desinit";
import { somaReacoesPilares, type LinhaRepSistrut } from "./vigas/rep";
import { analisaVigasComPendencias, type AnaliseVigaSistrut } from "./vigas/vicalc";

// ---------------------------------------------------------------- materiais e parâmetros

/** fck que o usuário do original digitaria para o fck da obra: nominal, MPa/100
 *  (15 MPa ↔ 150 kgf/cm² ↔ 0,15 t/cm²), como o fyk do CA-50 = 5 t/cm². */
export const fckOriginalTcm2 = (fckMpa: number) => fckMpa / 100;

/** Materiais da obra nas unidades do original (o objeto que os contratos recebem). */
export function materiaisSistrut(m: Materiais, modo: ModoSistrut): MateriaisSistrut {
  // CA-25 é sempre classe A (o original aceita B; a V2 avisa e calcula como A)
  const classeAco = m.aco === "CA-25" ? "A" : m.classeAco;
  if (modo === "original")
    return {
      fck: sng(fckOriginalTcm2(m.fck)),
      fyk: sng(FYK_ORIGINAL_TCM2[m.aco]),
      classeAco,
      gamaF: sng(PARAMETROS_LAJE.gamaF),
      gamaC: sng(PARAMETROS_LAJE.gamaC),
      gamaS: sng(PARAMETROS_LAJE.gamaS),
    };
  return {
    fck: mpaParaTcm2(m.fck),
    fyk: mpaParaTcm2(FYK_CORRIGIDO_MPA[m.aco]),
    classeAco,
    gamaF: PARAMETROS_LAJE.gamaF,
    gamaC: PARAMETROS_LAJE.gamaC,
    gamaS: PARAMETROS_LAJE.gamaS,
  };
}

/** Densidade do concreto, t/m³: 2,5 no original; 25 kN/m³ convertido no corrigido. */
export const densidadeSistrut = (modo: ModoSistrut) =>
  modo === "original" ? sng(DENSIDADE_CONCRETO_TM3) : PESO_CONCRETO_CORRIGIDO_KNM3 / KN_POR_TF;

/** Tabelas "SISTRUT" do original. No modo original, em SINGLE e com os cobrimentos
 *  delas; no corrigido, em decimal, com a densidade SI e os cobrimentos da obra. */
export function parametrosSistrut(m: Materiais, modo: ModoSistrut) {
  if (modo === "original")
    return {
      laje: emSingle(PARAMETROS_LAJE),
      dsp: emSingle(PARAMETROS_DSP),
      viga: emSingle(PARAMETROS_VIGA),
      pilar: emSingle(PARAMETROS_PILAR),
      pip: emSingle(PARAMETROS_PIP),
    };
  const densidade = densidadeSistrut(modo);
  return {
    laje: { ...PARAMETROS_LAJE, densidade, cobrimento: m.cobrimentoLaje },
    dsp: { ...PARAMETROS_DSP, cobrimento: m.cobrimentoViga },
    viga: PARAMETROS_VIGA,
    pilar: PARAMETROS_PILAR,
    pip: { ...PARAMETROS_PIP, densidade, cobrimento: m.cobrimentoPilar },
  };
}
export type ParametrosSistrut = ReturnType<typeof parametrosSistrut>;

// ---------------------------------------------------------------- resultado

/** Uma laje da V2 no painel do original. */
export interface LajeDoPainel {
  /** Id da laje na V2. */
  id: string;
  nome: string;
  /** Bordo da V2 de cada índice de bordo do original (0..3). */
  bordos: readonly Bordo[];
}

/** Uma viga detalhada: entrada do DESDIM, dimensionamento, detalhamento e quadro. */
export interface VigaSistrut {
  id: string;
  nome: string;
  entrada: EntradaDesdim;
  dimensionamento?: DimensionamentoDesdim;
  detalhamento?: DetalhamentoDesinit;
  quadro?: QuadroViga;
  avisos: string[];
}

export interface PavimentoSistrut {
  pavimentoId: string;
  nome: string;
  repeticoes: number;
  lajesDoPainel: LajeDoPainel[];
  painel: PainelLajes;
  /** Espessura mínima por laje (LAJECALC 3), com os códigos antes da otimização. */
  espessuras: Record<string, EspessuraDeLaje>;
  /** Esforços com o H da obra antes da otimização dos negativos (LAJECALC 5). */
  esforcosAntesOtimizacao: EsforcosLajes;
  /** Esforços depois da otimização (LAJECALC 6 + 5); iguais aos de antes se ela não
   *  convergiu (aviso). */
  esforcos: EsforcosLajes;
  armaduras: Record<string, ArmadurasDeLaje>;
  lajeproc: ResultadoLajeproc;
  eixos: EixoViga[];
  /** Id da viga da V2 pelo nome. */
  idVigas: Record<string, string>;
  geometriaVigas: GeometriaViga[];
  montagem: MontagemPavimentoSistrut;
  /** .VIG com as cargas indexadas resolvidas pelo VIGA. */
  vigasVig: DadosViga[];
  analises: AnaliseVigaSistrut[];
  naoProcessadas: string[];
  rep: LinhaRepSistrut[];
  vigas: VigaSistrut[];
  avisos: string[];
  memoria: Etapa[];
}

/** Um lance de pilar dimensionado pelo PILAREDI. */
export interface LancePilarSistrut {
  /** Coluna (posição) e nível do lance (0 = fundação). */
  coluna: string;
  nivel: number;
  /** Pavimento do lance (o de cima do nível) e a repetição. */
  pavimentoId: string;
  repeticao: number;
  pilarId: string;
  carga: CargaPilarNivelSistrut;
  dimensionamento?: DimensionamentoPilarSistrut;
  avisos: string[];
}

export interface ResultadoSistrut {
  modo: ModoSistrut;
  materiais: MateriaisSistrut;
  parametros: ParametrosSistrut;
  pavimentos: PavimentoSistrut[];
  colunas: ColunaEdificioSistrut[];
  lances: LancePilarSistrut[];
  /** Quadros das vigas detalhadas (.TAB) e o resumo do DESENHO (item 4). */
  quadros: QuadroViga[];
  resumoVigas: ResumoVigas;
  avisos: string[];
}

// ---------------------------------------------------------------- lajes

const BORDOS_ORIGINAL: readonly Bordo[] = ["esquerdo", "superior", "direito", "inferior"];

/** Vértices horários do retângulo, do canto inferior esquerdo (bordo k = k → k+1). */
const verticesDaLaje = (l: Laje) => [
  { x: l.x, y: l.y },
  { x: l.x, y: l.y + l.ly },
  { x: l.x + l.lx, y: l.y + l.ly },
  { x: l.x + l.lx, y: l.y },
];

const CODIGO_ENGASTE = 22;
const codigoForcado = (v: Vinculo) => (v === "livre" ? 1 : v === "apoiado" ? 0 : CODIGO_ENGASTE);

/** Painel do LAJECALC a partir das lajes do pavimento. */
function painelDoPavimento(
  pav: Pavimento,
  par: ParametrosSistrut,
  modo: ModoSistrut,
  avisos: string[],
) {
  const s = atribuicao(modo);
  const indices = new Map<string, number>();
  const indice = (p: { x: number; y: number }) => {
    const k = `${p.x.toFixed(4)};${p.y.toFixed(4)}`;
    if (!indices.has(k)) indices.set(k, indices.size + 1);
    return indices.get(k)!;
  };
  const lajesDoPainel: LajeDoPainel[] = [];
  const cargasPorArea: CargaPorArea[] = [];
  const nomes = new Set<string>();
  let lajes: LajeSistrut[] = pav.lajes.map((l) => {
    if (nomes.has(l.nome))
      avisos.push(`Laje ${l.nome} com nome repetido no pavimento ${pav.nome}.`);
    nomes.add(l.nome);
    const vertices = verticesDaLaje(l).map((p) => ({ x: s(p.x), y: s(p.y) }));
    lajesDoPainel.push({ id: l.id, nome: l.nome, bordos: BORDOS_ORIGINAL });
    if (l.sobrecarga > 0) {
      const q = s(knPorM2ParaTPorM2(l.sobrecarga));
      cargasPorArea.push({ vertices, total: q, acidental: q });
    }
    return {
      nome: l.nome,
      tipo: 0,
      vertices,
      indicesVertices: vertices.map(indice),
      grupo: 0,
      // código 1 (livre) antes da automática: ela preserva o 1 e zera o resto
      codigos: BORDOS_ORIGINAL.map((b) => (l.vinculos[b] === "livre" ? 1 : 0)),
      angulo: 0,
      mu: l.mu === 1 ? 0 : s(l.mu),
      cargaPermanente: s(knPorM2ParaTPorM2(l.revestimento)),
      pesoProprio: 0,
    } satisfies LajeSistrut;
  });

  // LAJECALC 1: continuidade automática e, por cima, a vinculação forçada da V2
  const auto = continuidadeAutomatica(lajes, par.laje);
  lajes = auto.lajes;
  let continuidades: Continuidade[] = auto.continuidades;
  pav.lajes.forEach((l, i) => {
    const sl = lajes[i]!;
    BORDOS_ORIGINAL.forEach((b, k) => {
      const v = l.vinculos[b];
      if (v === undefined) return;
      const doBordo = (c: Continuidade) =>
        (c.lajeA === sl.nome && c.bordoA === k) || (c.lajeB === sl.nome && c.bordoB === k);
      sl.codigos[k] = codigoForcado(v);
      if (v !== "engastado") {
        // o lado da vizinha fica engastado sem laje deste lado
        continuidades = continuidades.flatMap((c) => {
          if (!doBordo(c)) return [c];
          if (c.lajeB === null) return [];
          const ladoA = c.lajeA === sl.nome && c.bordoA === k;
          const outra = ladoA ? c.lajeB : c.lajeA;
          const bordo = ladoA ? c.bordoB : c.bordoA;
          return [{ lajeA: outra, bordoA: bordo, lajeB: null, bordoB: bordo }];
        });
      } else if (!continuidades.some(doBordo)) {
        continuidades.push({ lajeA: sl.nome, bordoA: k, lajeB: null, bordoB: k });
      }
    });
  });

  // LAJECALC 4: H da obra imposto (regrava o peso próprio = H·densidade/100)
  lajes = lajes.map((l, i) => {
    const r = impoeEspessura(l, pav.lajes[i]!.h, par.laje, modo);
    avisos.push(...r.avisos.map((a) => `${l.nome}: ${a}`));
    return r.laje;
  });

  const painel: PainelLajes = {
    lajes,
    cargasPorArea,
    alvenarias: [],
    continuidades,
    continuidadesConfirmadas: true,
  };
  return { painel, lajesDoPainel };
}

/** Vínculos da V2 a partir dos códigos (para a flecha do corrigido, R1). */
const vinculosDosCodigos = (codigos: readonly number[]) =>
  Object.fromEntries(
    BORDOS_ORIGINAL.map((b, k) => {
      const c = codigos[k] ?? 0;
      return [b, c === 1 ? "livre" : c > 2 ? "engastado" : "apoiado"];
    }),
  ) as Record<Bordo, Vinculo>;

// ---------------------------------------------------------------- vigas

/** Largura do apoio de um nó na direção da viga, cm: pilar (b em x, h em y), viga
 *  (bw) ou 0 (ponta livre). */
function larguraDoApoio(g: GeometriaViga, k: number, pav: Pavimento) {
  const a = g.apoios[k];
  if (!a || a.tipo === "livre") return 0;
  if (a.tipo === "pilar") {
    const p = pav.pilares.find((x) => x.id === a.id);
    return p ? (g.eixo.horizontal ? p.b : p.h) : 0;
  }
  return pav.vigas.find((v) => v.id === a.id)?.bw ?? 0;
}

/** Espessura da laje encostada na viga num lado, no meio do tramo, cm (0 sem laje). */
function lajeDoLado(g: GeometriaViga, s1: number, s2: number, lado: -1 | 1, pav: Pavimento) {
  const meio = (s1 + s2) / 2;
  const fora = 0.01 * lado;
  const { x, y } = g.eixo.horizontal
    ? { x: meio, y: g.eixo.c + fora }
    : { x: g.eixo.c + fora, y: meio };
  const l = pav.lajes.find((q) => x > q.x && x < q.x + q.lx && y > q.y && y < q.y + q.ly);
  return l?.h ?? 0;
}

/** Seções e forma da viga para o DESDIM/DESINIT (o .FOR que o FORMEDCA gravaria):
 *  vão livre face a face, largura dos apoios e espessura da laje de cada lado. */
function secoesEForma(g: GeometriaViga, dados: DadosViga, pav: Pavimento) {
  const secao: SecaoViga = { bw: g.viga.bw, hw: g.viga.h, bf: 0, hf: 0 };
  const n = dados.tramos.length;
  const be = dados.balancoEsquerdo ? 1 : 0;
  // nós da geometria: com balanço esquerdo, o nó 0 é a ponta livre
  const no = (apoio: number) => apoio + be;
  const largura = (apoio: number) => larguraDoApoio(g, no(apoio), pav);
  const forma = (inicioNo: number, fimNo: number, larguraEsq: number, larguraDir: number) => {
    const s1 = g.nos[inicioNo] ?? 0;
    const s2 = g.nos[fimNo] ?? 0;
    const vao = (s2 - s1) * 100;
    const [esq, dir] = g.eixo.horizontal ? [1, -1] : [-1, 1];
    return {
      larguraApoio: larguraEsq,
      vaoLivre: vao - larguraEsq / 2 - larguraDir / 2,
      pe: 0,
      hle: lajeDoLado(g, s1, s2, esq as 1 | -1, pav),
      pd: 0,
      hld: lajeDoLado(g, s1, s2, dir as 1 | -1, pav),
    } satisfies FormaTramo;
  };
  const tramos = dados.tramos.map((_, t) => forma(no(t), no(t + 1), largura(t), largura(t + 1)));
  const secoes: SecoesViga = {
    tramos: dados.tramos.map(() => secao),
    apoios: Array.from({ length: n + 1 }, () => secao),
    ...(dados.balancoEsquerdo ? { balancoEsquerdo: secao } : {}),
    ...(dados.balancoDireito ? { balancoDireito: secao } : {}),
  };
  const formaViga: FormaViga = {
    tramos,
    ...(dados.balancoEsquerdo ? { balancoEsquerdo: forma(0, 1, 0, largura(0)) } : {}),
    ...(dados.balancoDireito ? { balancoDireito: forma(no(n), no(n) + 1, largura(n), 0) } : {}),
  };
  const apoios: ApoioFormaViga[] = Array.from({ length: n + 1 }, (_, k) => {
    const a = g.apoios[no(k)];
    const w = largura(k);
    const tipo = a?.tipo === "viga" ? "V" : "P";
    const titulo = a && a.tipo !== "livre" ? a.nome : `${tipo}${k + 1}`;
    return { largura: w, tipo, titulo, codigo: 1, lps: w, dis: 0 };
  });
  return { secoes, forma: formaViga, apoios };
}

/** Eixos do LAJEMONT: nós em ordem crescente, apoio de cada nó e balanços. */
function eixosDasVigas(geometria: readonly GeometriaViga[], modo: ModoSistrut): EixoViga[] {
  const s = atribuicao(modo);
  return geometria.map((g) => ({
    nome: g.viga.nome,
    pontos: g.nos.map((p) =>
      g.eixo.horizontal ? { x: s(p), y: s(g.eixo.c) } : { x: s(g.eixo.c), y: s(p) },
    ),
    apoios: g.apoios.map((a) =>
      a.tipo === "pilar" ? { pilar: a.nome } : a.tipo === "viga" ? { viga: a.nome } : null,
    ),
    balancoInicio: g.apoios[0]?.tipo === "livre",
    balancoFim: g.apoios.at(-1)?.tipo === "livre",
  }));
}

/** Peso próprio das vigas em kg/m inteiro (LAJEMONT.BAS:5124): o mais comum é o
 *  predominante; os outros, exceções. */
function pesosDasVigas(pav: Pavimento, modo: ModoSistrut): PesoProprioVigas {
  const s = atribuicao(modo);
  const dens = densidadeSistrut(modo);
  const kg = new Map(pav.vigas.map((v) => [v.nome, pesoKgPorM(s(((v.bw * v.h) / 10_000) * dens))]));
  const contagem = new Map<number, number>();
  for (const k of kg.values()) contagem.set(k, (contagem.get(k) ?? 0) + 1);
  let predominante = 0;
  let maior = -1;
  for (const [k, n] of contagem)
    if (n > maior) {
      predominante = k;
      maior = n;
    }
  const excecoes = Object.fromEntries([...kg].filter(([, k]) => k !== predominante));
  return { predominanteKgPorM: predominante, excecoes };
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------- pavimento

function calcularPavimentoSistrut(
  pav: Pavimento,
  mat: MateriaisSistrut,
  par: ParametrosSistrut,
  modo: ModoSistrut,
): PavimentoSistrut {
  const s = atribuicao(modo);
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const { painel, lajesDoPainel } = painelDoPavimento(pav, par, modo, avisos);

  // alvenarias: a carga linear de cada viga sobre o eixo dela
  for (const v of pav.vigas)
    if (v.cargaLinear > 0)
      painel.alvenarias.push({
        inicio: { x: s(v.x1), y: s(v.y1) },
        fim: { x: s(v.x2), y: s(v.y2) },
        carga: s(knPorMParaTPorM(v.cargaLinear)),
      });

  // LAJECALC 5 (antes da otimização) e LAJECALC 3 (espessura mínima)
  const esforcosAntesOtimizacao = esforcosDoPainelCom()(painel, par.laje, modo);
  const espessuras: Record<string, EspessuraDeLaje> = {};
  for (const l of esforcosAntesOtimizacao.lajes) {
    const prep = esforcosAntesOtimizacao.preparadas[l.nome];
    const coef = esforcosAntesOtimizacao.coeficientes[l.nome];
    if (!prep || !coef) continue;
    const pv = pav.lajes.find((q) => q.nome === l.nome);
    const flecha: DadosFlechaLaje | undefined = pv && {
      lx: pv.lx,
      ly: pv.ly,
      vinculos: vinculosDosCodigos(l.codigos),
      acidental: knPorM2ParaTPorM2(pv.sobrecarga),
    };
    try {
      espessuras[l.nome] = espessuraMinimaLaje(
        (h) =>
          momentosComCoeficiente(
            l,
            prep.alvenaria,
            prep.cargaArea,
            prep.area,
            h,
            coef,
            par.laje,
            modo,
          ),
        mat,
        par.laje,
        modo,
        flecha,
      );
    } catch (e) {
      avisos.push(`${l.nome}: espessura mínima não calculada (${mensagem(e)})`);
    }
  }

  // LAJECALC 6: otimização dos negativos (no original roda sempre, decisão 4 do dono)
  let esforcos = esforcosAntesOtimizacao;
  try {
    esforcos = esforcosDoPainelCom((e, recalcula) =>
      otimizaNegativos(e, recalcula, mat, par.laje, modo),
    )(painel, par.laje, modo);
  } catch (e) {
    avisos.push(
      `Otimização dos negativos não feita: ${mensagem(e)} Valem os momentos antes da otimização.`,
    );
  }
  const armaduras: Record<string, ArmadurasDeLaje> = {};
  for (const [nome, m] of Object.entries(esforcos.momentos))
    armaduras[nome] = armadurasLaje(m, mat, par.laje, modo);
  const proc = lajeproc(esforcos, mat, par.laje, modo);

  // LAJEMONT: reações das lajes e .VIG
  const geo = geometriaDasVigas(pav);
  avisos.push(...geo.avisos);
  const eixos = eixosDasVigas(geo.vigas, modo);
  const idVigas = Object.fromEntries(geo.vigas.map((g) => [g.viga.nome, g.viga.id]));
  const montagem = montaPavimentoSistrut(
    esforcos,
    painel,
    eixos,
    () => null,
    pesosDasVigas(pav, modo),
    par.laje,
    modo,
  );

  // VIGA: análise (VICALC) e .REP
  const {
    analises,
    naoProcessadas,
    vigas: vigasVig,
  } = analisaVigasComPendencias(montagem.vigas, par.viga, modo);
  if (naoProcessadas.length > 0)
    avisos.push(
      `Vigas não processadas pelo VIGA (carga indexada sem origem): ${naoProcessadas.join(", ")}.`,
    );
  const processadas = new Set(analises.map((a) => a.nome));
  const vigasAnalisadas = vigasVig.filter((v) => processadas.has(v.nome));
  const rep = somaReacoesPilares(
    analises,
    analises.map((a) => vigasAnalisadas.find((v) => v.nome === a.nome)!),
    par.viga,
    modo,
  );

  // DESDIM / DESINIT / quadro (.TAB)
  const vigas: VigaSistrut[] = [];
  for (const dados of vigasAnalisadas) {
    const g = geo.vigas.find((x) => x.viga.nome === dados.nome);
    if (!g) continue;
    const { secoes, forma, apoios } = secoesEForma(g, dados, pav);
    const entrada: EntradaDesdim = {
      viga: dados,
      secoes,
      forma,
      materiais: mat,
      parametros: par.dsp,
    };
    const v: VigaSistrut = { id: g.viga.id, nome: dados.nome, entrada, avisos: [] };
    try {
      v.dimensionamento = dimensionaVigaDesdim(entrada, modo);
      v.detalhamento = detalhaVigaDesinit(entrada, v.dimensionamento, modo, { apoios });
      v.quadro = quadroDaViga(v.detalhamento, secoes, forma, pav.repeticoes, par.dsp, modo);
    } catch (e) {
      const qb = e instanceof ErroQB ? " (o original para com erro de execução)" : "";
      v.avisos.push(
        `${dados.nome}: dimensionamento/detalhamento não concluído: ${mensagem(e)}${qb}`,
      );
    }
    vigas.push(v);
  }

  return {
    pavimentoId: pav.id,
    nome: pav.nome,
    repeticoes: pav.repeticoes,
    lajesDoPainel,
    painel,
    espessuras,
    esforcosAntesOtimizacao,
    esforcos,
    armaduras,
    lajeproc: proc,
    eixos,
    idVigas,
    geometriaVigas: geo.vigas,
    montagem,
    vigasVig,
    analises,
    naoProcessadas,
    rep,
    vigas,
    avisos,
    memoria,
  };
}

// ---------------------------------------------------------------- pilares

const chavePilar = (p: Pick<Pilar, "x" | "y">) => `${p.x.toFixed(3)};${p.y.toFixed(3)}`;

/** Níveis do edifício de baixo para cima: cada repetição de pavimento é um nível. */
function niveisDoEdificio(obra: Obra) {
  const niveis: { pav: Pavimento; repeticao: number }[] = [];
  for (const pav of [...obra.pavimentos].reverse())
    for (let r = Math.max(1, pav.repeticoes); r >= 1; r--) niveis.push({ pav, repeticao: r });
  return niveis;
}

function calcularPilaresSistrut(
  obra: Obra,
  pavimentos: readonly PavimentoSistrut[],
  mat: MateriaisSistrut,
  par: ParametrosSistrut,
  modo: ModoSistrut,
  avisos: string[],
) {
  const s = atribuicao(modo);
  const niveis = niveisDoEdificio(obra);
  const porId = new Map(pavimentos.map((p) => [p.pavimentoId, p]));
  // colunas: posição de pilar do nível mais baixo, subindo enquanto o pilar existir
  const chaves: string[] = [];
  for (const { pav } of niveis)
    for (const p of pav.pilares) if (!chaves.includes(chavePilar(p))) chaves.push(chavePilar(p));
  const colunas: ColunaEdificioSistrut[] = [];
  /** Lances de cada coluna (mesmo índice de `colunas`): pilar e nível de baixo. */
  const lancesDasColunas: { pilar: Pilar; nivel: number }[][] = [];
  chaves.forEach((chave, i) => {
    const lances: { pilar: Pilar; nivel: number }[] = [];
    for (const [k, { pav }] of niveis.entries()) {
      const p = pav.pilares.find((q) => chavePilar(q) === chave);
      if (!p) break;
      lances.push({ pilar: p, nivel: k });
    }
    if (lances.length === 0) {
      const p = niveis.flatMap((n) => n.pav.pilares).find((q) => chavePilar(q) === chave);
      avisos.push(
        `Pilar ${p?.nome ?? chave} não chega à fundação (nasce sobre viga): o PILAREDI não o dimensiona.`,
      );
      return;
    }
    // nome com o número da coluna: o PILGEEDI casa o .REP pelo número no nome
    const nome = `P ${i + 1}`;
    let cota = 0;
    const nivel = (secao: Pilar) => ({
      cota: s(cota),
      secao: { tipo: "retangular" as const, b: s(secao.b), h: s(secao.h), barras: [] },
      vinculoX: 2 as const,
      vinculoY: 2 as const,
      normalVento: 0,
      mkx: 0,
      mky: 0,
    });
    const nvs = [];
    for (const l of lances) {
      nvs.push(nivel(l.pilar));
      cota += niveis[l.nivel]!.pav.peDireito;
    }
    nvs.push(nivel(lances.at(-1)!.pilar));
    colunas.push({ nome, pilarRep: nome, niveis: nvs });
    lancesDasColunas.push(lances);
  });

  // .REP de cada nível (o do pavimento, com o nome do pilar trocado pelo da coluna)
  const reps: LeituraRep[] = [];
  for (const [k, { pav }] of niveis.entries()) {
    const ps = porId.get(pav.id);
    if (!ps) continue;
    const linhas = ps.rep.flatMap((linha) => {
      const p = pav.pilares.find((q) => q.nome === linha.pilar);
      const c = p
        ? colunas.find((_, i) => lancesDasColunas[i]!.some((l) => l.pilar.id === p.id))
        : undefined;
      return c ? [{ ...linha, pilar: c.nome }] : [];
    });
    // o nível k do .REP é o topo do lance k − 1: carga no nível k + 1 da coluna
    reps.push({ linhas, nivelInicial: k + 1, nivelFinal: k + 1, modo: "substitui" });
  }

  const cargas = cargasPilaresSistrut(reps, colunas, par.pip, modo);
  const lances: LancePilarSistrut[] = [];
  for (const carga of cargas) {
    const ci = colunas.findIndex((c) => c.nome === carga.coluna);
    const coluna = colunas[ci]!;
    const lance = lancesDasColunas[ci]![carga.nivel];
    if (!lance) continue;
    const { pav, repeticao } = niveis[lance.nivel]!;
    const l: LancePilarSistrut = {
      coluna: coluna.nome,
      nivel: carga.nivel,
      pavimentoId: pav.id,
      repeticao,
      pilarId: lance.pilar.id,
      carga,
      avisos: [],
    };
    try {
      l.dimensionamento = dimensionaPilarSistrut(carga, coluna, mat, par.pilar, par.pip, modo);
    } catch (e) {
      l.avisos.push(`${lance.pilar.nome}: dimensionamento não concluído: ${mensagem(e)}`);
    }
    lances.push(l);
  }
  return { colunas, lances };
}

// ---------------------------------------------------------------- obra

/** Calcula a obra pelo caminho do SISTRUT 4.0 (NB-1/78), no modo dado. Resultado nas
 *  unidades do original. */
export function calcularObraSistrut(obra: Obra, opcoes: { modo: ModoSistrut }): ResultadoSistrut {
  const { modo } = opcoes;
  const mat = materiaisSistrut(obra.materiais, modo);
  const par = parametrosSistrut(obra.materiais, modo);
  const avisos: string[] = [];
  if (obra.materiais.aco === "CA-25" && obra.materiais.classeAco === "B")
    avisos.push("Aço CA-25 é sempre classe A; a classe B informada foi ignorada.");
  const pavimentos = obra.pavimentos.map((p) => calcularPavimentoSistrut(p, mat, par, modo));
  const { colunas, lances } = calcularPilaresSistrut(obra, pavimentos, mat, par, modo, avisos);
  const quadros = pavimentos.flatMap((p) => p.vigas.flatMap((v) => (v.quadro ? [v.quadro] : [])));
  return {
    modo,
    materiais: mat,
    parametros: par,
    pavimentos,
    colunas,
    lances,
    quadros,
    resumoVigas: resumoGeralVigas(quadros, par.dsp, modo),
    avisos,
  };
}
