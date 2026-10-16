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
//   no seu nível; seção, vínculos, vento, excentricidade, carga no topo e verificações
//   do pilar por `pilaresDaObra.ts` (ausentes: retângulo b × h e "continuidade").
// - entrada de viga do VIGA e do DESENHO (cargas, vãos, J, engastes, momentos externos,
//   apoios desconsiderados, .SEC, .FOR; `edicaoVig.ts`) e o VIGA.INI/.DSP da obra
//   (`Obra.parametrosViga`) por cima do que a montagem grava e dos padrões de fábrica.
//
// Materiais: original = fck nominal (MPa/100 → t/cm²: 15 MPa = 0,15 t/cm², o que o
// usuário do original digitava para 150 kgf/cm²), fyk pela categoria (CA-50 = 5 t/cm²),
// classe da obra, γ 1,4/1,4/1,15, densidade 2,5 t/m³, cobrimentos dos parâmetros
// "SISTRUT" (.LAP 1,5; .DSP 2,0 + 2,0; .PIP 2,0), Float32 por atribuição. Corrigido =
// SI convertido exato (fck/98,0665, 500 MPa → 5,0986 t/cm², 25 kN/m³ → 2,5493 t/m³),
// cobrimentos da obra, float64.
import type { Bordo, Laje, Materiais, Obra, Pavimento, Pilar, Vinculo } from "../../dominio/obra";
import type { BarraImposta, ParametrosLajeObra, Ponto, TipoLaje } from "../../dominio/obra";
import type { ParametrosVigaObra } from "../../dominio/obra";
import { geometriaDasVigas, type GeometriaViga } from "../montagem";
import type { Etapa } from "../tipos";
import { atribuicao, ErroQB, qbUsing, sng } from "./base/f32";
import { ErroNaoConverge, qbCint } from "./base/f32";
import {
  emSingle,
  PARAMETROS_DSP,
  PARAMETROS_LAJE,
  PARAMETROS_PILAR,
  PARAMETROS_PIP,
  PARAMETROS_VIGA,
} from "./base/parametros";
import type {
  AnaliseViga,
  ApoioFormaViga,
  ArmadurasDeLaje,
  CargaPilarNivel,
  CargaPorArea,
  ColunaEdificio,
  Continuidade,
  DadosFlechaLaje,
  DadosViga,
  DetalhamentoViga,
  DimensionamentoPilar,
  DimensionamentoViga,
  EixoViga,
  EntradaDesdim,
  EsforcosLajes,
  EspessuraDeLaje,
  FormaTramo,
  FormaViga,
  LajeSistrut,
  LeituraRep,
  LinhaRep,
  MateriaisSistrut,
  NivelColuna,
  ModoSistrut,
  MontagemPavimento,
  PainelLajes,
  PesoProprioVigas,
  PilarMontagem,
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
import { espessuraMinimaLaje } from "./lajes/espessura";
import { impoeEspessura, momentosComCoeficiente } from "./lajes/momentos";
import { otimizaNegativos } from "./lajes/otimizacao";
import type { OtimizacaoParada } from "./lajes/otimizacao";
import { lajeproc } from "./lajes/proc";
import { montaPavimento } from "./montagem/reacoes";
import { pesoKgPorM } from "./montagem/vigas";
import { dimensionaPilar } from "./pilares/armadura";
import { cargasPilares, qbVal, resumoFundacao } from "./pilares/carga";
import { quadroDaViga, resumoGeralVigas } from "./quant/vigas";
import { dimensionaViga } from "./vigas/desdim";
import { detalhaViga } from "./vigas/desinit";
import { somaReacoesPilares } from "./vigas/rep";
import { analisaVigas } from "./vigas/vicalc";
import {
  cargaDoNivel,
  materiaisPilar,
  nivelDoPilar,
  parametrosPilarDaObra,
  predimensionaColuna,
  verificacoesDoPilar,
  type PredimensionamentoSistrut,
  type VerificacaoPilarSistrut,
} from "./pilaresDaObra";
import { editaVig, secoesEFormaDaObra } from "./edicaoVig";

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
export function parametrosSistrut(m: Materiais, modo: ModoSistrut, pv?: ParametrosVigaObra) {
  const { dsp: dspObra, viga: vigaObra } = tabelasDaObra(pv);
  if (modo === "original")
    return {
      laje: emSingle(PARAMETROS_LAJE),
      dsp: emSingle(dspObra),
      viga: emSingle(vigaObra),
      pilar: emSingle(PARAMETROS_PILAR),
      pip: emSingle(PARAMETROS_PIP),
    };
  const densidade = densidadeSistrut(modo);
  return {
    laje: { ...PARAMETROS_LAJE, densidade, cobrimento: m.cobrimentoLaje },
    dsp: { ...dspObra, cobrimento: m.cobrimentoViga },
    viga: vigaObra,
    pilar: PARAMETROS_PILAR,
    pip: { ...PARAMETROS_PIP, densidade, cobrimento: m.cobrimentoPilar },
  };
}
export type ParametrosSistrut = ReturnType<typeof parametrosSistrut>;

/** Adaptador do domínio para a tabela do .LAP: os campos de `Obra.parametrosLaje` têm
 *  os nomes e as unidades de `PARAMETROS_LAJE` (o compilador confere). */
const tabelaLapDaObra = (lap: ParametrosLajeObra): Partial<typeof PARAMETROS_LAJE> => ({ ...lap });

/** Troca em `par.laje` os valores do .LAP que a obra editou, nos dois modos (em SINGLE no
 *  original). O resto da tabela fica como `parametrosSistrut` a montou. */
export function aplicaParametrosLaje(
  par: ParametrosSistrut,
  lap: ParametrosLajeObra | undefined,
  modo: ModoSistrut,
) {
  if (!lap) return;
  const editados = tabelaLapDaObra(lap);
  par.laje = { ...par.laje, ...(modo === "original" ? emSingle(editados) : editados) };
}

/** Adaptador domínio → cálculo: o VIGA.INI e o .DSP da obra (`ParametrosVigaObra`, tipo
 *  próprio do domínio) por cima das tabelas de fábrica, cada campo substituindo o inteiro.
 *  O tipo de retorno obriga o domínio a ter a forma das tabelas. */
export function tabelasDaObra(pv: ParametrosVigaObra | undefined): {
  dsp: typeof PARAMETROS_DSP;
  viga: typeof PARAMETROS_VIGA;
} {
  return { dsp: { ...PARAMETROS_DSP, ...pv?.dsp }, viga: { ...PARAMETROS_VIGA, ...pv?.viga } };
}

/** Materiais do DESDIM/DESINIT. No modo original, o fck, o fyk, a classe do aço e os γ do
 *  .DSP da obra, quando ela os dá (o DESDIM lê os do .DSP, DESENHO.BAS:4774-4789); no
 *  corrigido, sempre os da obra. */
export function materiaisDaViga(
  mat: MateriaisSistrut,
  pv: ParametrosVigaObra | undefined,
  modo: ModoSistrut,
): MateriaisSistrut {
  const d = pv?.dsp;
  if (modo !== "original" || !d) return mat;
  return {
    fck: d.fck !== undefined ? sng(d.fck) : mat.fck,
    fyk: d.fyk !== undefined ? sng(d.fyk) : mat.fyk,
    classeAco: d.classeAco ?? mat.classeAco,
    gamaF: d.gamaF !== undefined ? sng(d.gamaF) : mat.gamaF,
    gamaC: d.gamaC !== undefined ? sng(d.gamaC) : mat.gamaC,
    gamaS: d.gamaS !== undefined ? sng(d.gamaS) : mat.gamaS,
  };
}

// ---------------------------------------------------------------- resultado

/** Uma laje da V2 no painel do original. */
export interface LajeDoPainel {
  /** Id da laje na V2. */
  id: string;
  nome: string;
  /** Bordo da V2 de cada índice de bordo do original (0..3). */
  bordos: readonly Bordo[];
  /** Cargas de ocupação do pavimento que contêm o centroide da laje, kN/m² (as da obra,
   *  sem conversão): a parte permanente (total − acidental) e a acidental, para a tela e
   *  a flecha. O LAJECALC e o LAJEMONT usam os polígonos exatos. */
  ocupacao?: { permanente: number; acidental: number };
  /** Vãos da flecha do corrigido, m: lx e ly da laje retangular; com polígono, a maior
   *  corda horizontal e a vertical (9 retas, como o LAJECALC 2 mede as cordas). */
  vaosFlecha?: { lx: number; ly: number };
}

/** Uma viga detalhada: entrada do DESDIM, dimensionamento, detalhamento e quadro. */
export interface VigaSistrut {
  id: string;
  nome: string;
  entrada: EntradaDesdim;
  dimensionamento?: DimensionamentoViga;
  detalhamento?: DetalhamentoViga;
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
  /** Armaduras da opção 5 antes e depois da otimização. */
  armadurasAntesOtimizacao: Record<string, ArmadurasDeLaje>;
  armaduras: Record<string, ArmadurasDeLaje>;
  lajeproc: ResultadoLajeproc;
  eixos: EixoViga[];
  /** Id da viga da V2 pelo nome. */
  idVigas: Record<string, string>;
  geometriaVigas: GeometriaViga[];
  montagem: MontagemPavimento;
  /** .VIG com as cargas indexadas resolvidas pelo VIGA. */
  vigasVig: DadosViga[];
  /** .VIG que o VIGA lê: o da montagem com o que a obra diz de cada viga (cargas, vãos,
   *  J, engastes, momentos externos; edicaoVig.ts), antes de resolver as indexadas. */
  vig: DadosViga[];
  analises: AnaliseViga[];
  naoProcessadas: string[];
  rep: LinhaRep[];
  vigas: VigaSistrut[];
  avisos: string[];
  memoria: Etapa[];
  /** Onde a otimização dos negativos do original entra em laço sem fim (R3, só no modo
   *  original): a tela parada. Ausente = convergiu ou não rodou. */
  otimizacaoParada?: OtimizacaoParada;
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
  carga: CargaPilarNivel;
  dimensionamento?: DimensionamentoPilar;
  avisos: string[];
}

export interface ResultadoSistrut {
  modo: ModoSistrut;
  materiais: MateriaisSistrut;
  parametros: ParametrosSistrut;
  pavimentos: PavimentoSistrut[];
  colunas: ColunaEdificio[];
  lances: LancePilarSistrut[];
  /** Quadros das vigas detalhadas (.TAB) e o resumo do DESENHO (item 4). */
  quadros: QuadroViga[];
  resumoVigas: ResumoVigas;
  avisos: string[];
  /** Carga que não chegou à fundação, por pavimento: pilar que não continua até a
   *  fundação (transição sobre viga, que o PILGEEDI não modela) e linha do .REP sem
   *  coluna. A projeção marca o pavimento com falha. */
  falhas: { pavimentoId: string; texto: string }[];
  /** Materiais dos pilares: os da obra com os do PILAR.INI da obra por cima. */
  materiaisPilar: MateriaisSistrut;
  /** PILAR opção 6 de cada `Pilar.verificacoes` (pilaresDaObra.ts). */
  verificacoes: VerificacaoPilarSistrut[];
  /** PILAREDI 3.1 por coluna, com `obra.parametrosPilar.predimensionamento`. */
  predimensionamentos: PredimensionamentoSistrut[];
  /** Resumo de cargas na fundação por coluna (PILAREDI.BAS:960-1000, `resumoFundacao`):
   *  acumulada, peso próprio, carga na fundação e momentos da base, t e tm. */
  fundacoes: ({ coluna: string; pilarId: string } & ReturnType<typeof resumoFundacao>)[];
}

// ---------------------------------------------------------------- lajes

const BORDOS_ORIGINAL: readonly Bordo[] = ["esquerdo", "superior", "direito", "inferior"];

/** Cantos horários do retângulo, do canto inferior esquerdo (bordo k = k → k+1). */
const cantosDaLaje = (l: Laje) => [
  { x: l.x, y: l.y },
  { x: l.x, y: l.y + l.ly },
  { x: l.x + l.lx, y: l.y + l.ly },
  { x: l.x + l.lx, y: l.y },
];

/** Polígono horário da laje: o `poligono` dela ou os cantos do retângulo. */
export const verticesDaLaje = (l: Laje): Ponto[] => l.poligono ?? cantosDaLaje(l);

/** Área com sinal (fórmula dos trapézios): negativa no sentido horário. */
const areaComSinal = (p: readonly Ponto[]) =>
  p.reduce((a, v, k) => {
    const w = p[(k + 1) % p.length]!;
    return a + (v.x * w.y - w.x * v.y) / 2;
  }, 0);

/** Ponto dentro do polígono (raio horizontal). */
export function dentroDoPoligono(q: Ponto, p: readonly Ponto[]) {
  let dentro = false;
  for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
    const a = p[k]!;
    const b = p[j]!;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x)
      dentro = !dentro;
  }
  return dentro;
}

/** Centroide de área do polígono. */
function centroide(p: readonly Ponto[]): Ponto {
  const a = areaComSinal(p);
  let x = 0;
  let y = 0;
  p.forEach((v, k) => {
    const w = p[(k + 1) % p.length]!;
    const c = v.x * w.y - w.x * v.y;
    x += (v.x + w.x) * c;
    y += (v.y + w.y) * c;
  });
  return { x: x / (6 * a), y: y / (6 * a) };
}

/** Cargas de ocupação do pavimento que contêm o centroide da laje, kN/m²: a parte
 *  permanente (total − acidental) e a acidental. Serve à flecha do corrigido e à
 *  entrada mostrada na tela; o LAJECALC e o LAJEMONT usam os polígonos exatos. */
export function ocupacaoDaLaje(l: Laje, pav: Pavimento) {
  const c = centroide(verticesDaLaje(l));
  let permanente = 0;
  let acidental = 0;
  for (const a of pav.cargasOcupacao ?? [])
    if (dentroDoPoligono(c, a.poligono)) {
      permanente += a.total - a.acidental;
      acidental += a.acidental;
    }
  return { permanente, acidental };
}

/** Maior corda do polígono na direção x (`vertical` = false) ou y: o maior trecho
 *  interno em 9 retas paralelas que dividem a faixa em 10 (a regra das cordas do
 *  LAJECALC 2, LAJECALC.BAS:4801-4971). */
export function maiorCorda(p: readonly Ponto[], vertical: boolean) {
  const q = vertical ? p.map((v) => ({ x: v.y, y: v.x })) : p;
  const ys = q.map((v) => v.y);
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  let maior = 0;
  for (let r = 1; r <= 9; r++) {
    const y = y0 + ((y1 - y0) * r) / 10;
    const xs: number[] = [];
    q.forEach((a, k) => {
      const b = q[(k + 1) % q.length]!;
      if (a.y > y !== b.y > y) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
    });
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) maior = Math.max(maior, xs[k + 1]! - xs[k]!);
  }
  return maior;
}

/** Vãos da flecha da laje (ver `LajeDoPainel.vaosFlecha`). */
const vaosDaFlecha = (l: Laje) =>
  l.poligono
    ? { lx: maiorCorda(l.poligono, false), ly: maiorCorda(l.poligono, true) }
    : { lx: l.lx, ly: l.ly };

/** Bordo da V2 de um lado do polígono horário: o da normal externa (−dy, dx), pelo eixo
 *  dominante (o lado inclinado vai para o bordo mais próximo). */
function bordoDoLado(a: Ponto, b: Ponto): Bordo {
  const nx = -(b.y - a.y);
  const ny = b.x - a.x;
  if (Math.abs(nx) >= Math.abs(ny)) return nx < 0 ? "esquerdo" : "direito";
  return ny < 0 ? "inferior" : "superior";
}

/** Vínculo forçado do lado k: por lado com polígono, pelo bordo da V2 sem ele. */
const vinculoDoLado = (l: Laje, bordos: readonly Bordo[], k: number) =>
  l.poligono ? (l.vinculosLados?.[k] ?? undefined) : l.vinculos[bordos[k]!];

const TIPO_LAJE: Record<TipoLaje, LajeSistrut["tipo"]> = {
  macica: 0,
  "pre-moldada": 1,
  "comum-nao-calculada": 3,
};

const TOL_VERTICE = 1e-6;
const dentro = (v: number, a: number, b: number) =>
  v > Math.min(a, b) + TOL_VERTICE && v < Math.max(a, b) - TOL_VERTICE;

/** Polígono da laje como o usuário do LAJEGEOM o desenharia: os cantos e, em cada
 *  bordo, os cantos das outras lajes que caem dentro dele (vértice compartilhado). Só
 *  assim um bordo encostado em parte numa vizinha vira continuidade no original, que
 *  compara os dois vértices do lado (LAJECALC.BAS:3714-3720). `bordos[k]` = bordo da
 *  V2 do lado k → k+1. */
function poligonoDaLaje(l: Laje, outras: readonly Laje[]) {
  // polígono da obra: como está (é o que o usuário do LAJEGEOM desenhou)
  const p = l.poligono;
  if (p) return { vertices: p, bordos: p.map((a, k) => bordoDoLado(a, p[(k + 1) % p.length]!)) };
  const cantos = cantosDaLaje(l);
  const vertices: { x: number; y: number }[] = [];
  const bordos: Bordo[] = [];
  cantos.forEach((a, k) => {
    const b = cantos[(k + 1) % 4]!;
    const horizontal = a.y === b.y;
    const sentido = horizontal ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y);
    const meio = outras
      .flatMap(verticesDaLaje)
      .filter((p) =>
        horizontal
          ? Math.abs(p.y - a.y) < TOL_VERTICE && dentro(p.x, a.x, b.x)
          : Math.abs(p.x - a.x) < TOL_VERTICE && dentro(p.y, a.y, b.y),
      )
      .sort((p, q) => (horizontal ? p.x - q.x : p.y - q.y) * sentido)
      .filter(
        (p, i, lista) =>
          i === 0 || Math.hypot(p.x - lista[i - 1]!.x, p.y - lista[i - 1]!.y) > TOL_VERTICE,
      );
    for (const p of [a, ...meio]) {
      vertices.push(p);
      bordos.push(BORDOS_ORIGINAL[k]!);
    }
  });
  return { vertices, bordos };
}

const CODIGO_ENGASTE = 22;
const codigoForcado = (v: Vinculo) => (v === "livre" ? 1 : v === "apoiado" ? 0 : CODIGO_ENGASTE);

/** Código do lado engastado no LAJECALC 1: CINT(máximo Mneg/Mpos·10 + 2) (22 de
 *  fábrica; LAJECALC.BAS:3961, 3730-3731). */
const codigoDoEngaste = (par: ParametrosSistrut) => qbCint(sng(par.laje.relacaoNegPosMax) * 10 + 2);

/** As continuidades da lista confirmada (`Pavimento.continuidadesLajes`): os lados
 *  dela engastados com o código do engaste, os livres com 1 e os outros com 0. Linha
 *  com laje inexistente, lado fora do polígono ou laje não maciça (o assistente as
 *  recusa, LAJECALC.BAS:3912) fica de fora, com aviso. */
function continuidadesDaLista(
  pav: Pavimento,
  sistrut: readonly LajeSistrut[],
  doPainel: readonly LajeDoPainel[],
  par: ParametrosSistrut,
  avisos: string[],
) {
  const lajes = sistrut.map((sl, i) => ({
    ...sl,
    codigos: sl.codigos.map((_, k): number =>
      vinculoDoLado(pav.lajes[i]!, doPainel[i]!.bordos, k) === "livre" ? 1 : 0,
    ),
  }));
  const indice = new Map(pav.lajes.map((l, i) => [l.id, i]));
  const codigo = codigoDoEngaste(par);
  const continuidades: Continuidade[] = [];
  for (const c of pav.continuidadesLajes ?? []) {
    const a = lajes[indice.get(c.lajeA) ?? -1];
    const b = c.lajeB === undefined ? undefined : lajes[indice.get(c.lajeB) ?? -1];
    const ladoB = c.ladoB ?? -1;
    const texto = `Continuidade ${c.lajeA} lado ${c.ladoA + 1}${c.lajeB ? ` × ${c.lajeB} lado ${ladoB + 1}` : ""}`;
    if (!a || (c.lajeB !== undefined && !b)) {
      avisos.push(`${texto}: laje que não existe no pavimento; ignorada.`);
      continue;
    }
    if (c.ladoA >= a.codigos.length || (b && (ladoB < 0 || ladoB >= b.codigos.length))) {
      avisos.push(`${texto}: lado fora do polígono; ignorada.`);
      continue;
    }
    if (a.tipo !== 0 || (b && b.tipo !== 0)) {
      avisos.push(`${texto}: laje não maciça; o SISTRUT não a aceita e ela foi ignorada.`);
      continue;
    }
    a.codigos[c.ladoA] = codigo;
    if (b) b.codigos[ladoB] = codigo;
    continuidades.push({
      lajeA: a.nome,
      bordoA: c.ladoA,
      lajeB: b?.nome ?? null,
      bordoB: b ? ladoB : c.ladoA,
    });
  }
  return { lajes, continuidades };
}

/** Código da barra imposta: no LAJECALC, CINT(1000·índice da bitola + espaçamento em
 *  cm) (LAJECALC.BAS:4166); no LAJEPROC, −(1000·índice da bitola + índice 1-based do
 *  espaçamento) (LAJEPROC.BAS:451, 892). Bitola ou espaçamento fora das tabelas do .LAP:
 *  aviso e nada. */
function codigoDaBarra(
  b: BarraImposta,
  origem: "lajecalc" | "lajeproc",
  par: ParametrosSistrut,
  avisos: string[],
) {
  const perto = (x: number, y: number) => Math.abs(x - y) < 1e-4;
  const ib = par.laje.bitolas.findIndex((x) => perto(x.bitola, b.bitola));
  const ie = par.laje.espacamentos.findIndex((x) => perto(x, b.espacamento));
  if (ib < 0 || (origem === "lajeproc" && ie < 0)) {
    avisos.push(
      `Barra imposta φ${b.bitola} c/${b.espacamento} fora das tabelas do .LAP; ignorada.`,
    );
    return undefined;
  }
  return origem === "lajecalc" ? qbCint(1000 * ib + b.espacamento) : -(1000 * ib + ie + 1);
}

/** Positivas impostas da laje no formato do LAJEPROC (`LajeSistrut.armaduraImposta`). */
function armaduraImpostaDaLaje(l: Laje, par: ParametrosSistrut, avisos: string[]) {
  const a = l.armaduraImposta;
  if (!a) return {};
  const principal = a.principal && codigoDaBarra(a.principal, "lajeproc", par, avisos);
  const secundaria = a.secundaria && codigoDaBarra(a.secundaria, "lajeproc", par, avisos);
  return {
    armaduraImposta: {
      ...(principal ? { principal } : {}),
      ...(secundaria ? { secundaria } : {}),
    },
  };
}

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
    const poligono = poligonoDaLaje(
      l,
      pav.lajes.filter((o) => o.id !== l.id),
    );
    if (areaComSinal(poligono.vertices) >= 0)
      avisos.push(
        `Laje ${l.nome}: polígono fora do sentido horário (o LAJEGEOM só grava o horário); o cálculo dela não reproduz o original.`,
      );
    const vertices = poligono.vertices.map((p) => ({ x: s(p.x), y: s(p.y) }));
    lajesDoPainel.push({
      id: l.id,
      nome: l.nome,
      bordos: poligono.bordos,
      ocupacao: ocupacaoDaLaje(l, pav),
      vaosFlecha: vaosDaFlecha(l),
    });
    if (l.sobrecarga > 0) {
      const q = s(knPorM2ParaTPorM2(l.sobrecarga));
      cargasPorArea.push({ vertices, total: q, acidental: q });
    }
    const tipo = TIPO_LAJE[l.tipo ?? "macica"];
    return {
      nome: l.nome,
      tipo,
      vertices,
      indicesVertices: vertices.map(indice),
      grupo: l.grupo ?? 0,
      // código 1 (livre) antes da automática: ela preserva o 1 e zera o resto
      codigos: poligono.bordos.map((_, k) =>
        vinculoDoLado(l, poligono.bordos, k) === "livre" ? 1 : 0,
      ),
      // LAJECALC 2 (LAJECALC.BAS:4537-4551) só dá direção e μ à maciça; nas outras o
      // ângulo vira −1 e o μ fica 0 (REDIM), salvo o que o usuário der por <D> e <R>
      // (4584-4700). μ = 1 da obra = não informado: pelas cordas na maciça, 0 no tipo 3
      // (o original para em 1/√μ, LAJECALC.BAS:7239). Na pré-moldada o ângulo é o das
      // nervuras (A_10cc(·,5)), que a montagem usa.
      angulo: tipo === 3 && l.anguloArmadura === undefined ? s(-1) : s(l.anguloArmadura ?? 0),
      mu: tipo === 1 || (l.mu === 1 && !l.muInformado) ? 0 : s(l.mu),
      ...armaduraImpostaDaLaje(l, par, avisos),
      cargaPermanente: s(knPorM2ParaTPorM2(l.revestimento)),
      pesoProprio: 0,
    } satisfies LajeSistrut;
  });
  // cargas de ocupação com polígono próprio (LAJEGEOM 3), depois das sobrecargas
  for (const a of pav.cargasOcupacao ?? [])
    cargasPorArea.push({
      vertices: a.poligono.map((p) => ({ x: s(p.x), y: s(p.y) })),
      total: s(knPorM2ParaTPorM2(a.total)),
      acidental: s(knPorM2ParaTPorM2(a.acidental)),
    });

  // LAJECALC 1: continuidade automática e, por cima, a vinculação forçada da V2
  const auto = continuidadeAutomatica(lajes, par.laje);
  lajes = auto.lajes;
  let continuidades: Continuidade[] = auto.continuidades;
  pav.lajes.forEach((l, i) => {
    const sl = lajes[i]!;
    lajesDoPainel[i]!.bordos.forEach((_, k, bordos) => {
      const v = vinculoDoLado(l, bordos, k);
      if (v === undefined) return;
      // o original não liga continuidade a laje não maciça (LAJECALC.BAS:3695, 3912)
      if (v === "engastado" && sl.tipo !== 0) {
        avisos.push(
          `Laje ${l.nome}, lado ${k + 1}: engaste em laje não maciça; o SISTRUT não o aceita e ele foi ignorado.`,
        );
        return;
      }
      const doBordo = (c: Continuidade) =>
        (c.lajeA === sl.nome && c.bordoA === k) || (c.lajeB === sl.nome && c.bordoB === k);
      sl.codigos[k] = codigoForcado(v);
      // o engaste do LAJECALC 1 grava CINT(máximo·10 + 2) (LAJECALC.BAS:3961)
      if (v === "engastado") sl.codigos[k] = codigoDoEngaste(par);
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

  // LAJECALC 1 confirmado trecho a trecho (`Pavimento.continuidadesLajes`, o A_11e0):
  // a lista vale no lugar da automática e dos vínculos forçados; os livres ficam
  if (pav.continuidadesLajes) {
    const confirmadas = continuidadesDaLista(pav, lajes, lajesDoPainel, par, avisos);
    lajes = confirmadas.lajes;
    continuidades = confirmadas.continuidades;
  }

  // i digitado por lado no <A>ltera do LAJECALC 1 (LAJECALC.BAS:4058-4104)
  pav.lajes.forEach((l, i) =>
    l.coeficientesLados?.forEach((coef, k) => {
      const sl = lajes[i]!;
      if (coef === null || !((sl.codigos[k] ?? 0) > 2)) return;
      const c = s(coef);
      if (c > par.laje.relacaoNegPosMax || c < par.laje.relacaoNegPosMin) {
        // o original recusa (BEEP, LAJECALC.BAS:4096)
        avisos.push(
          `Laje ${l.nome}, lado ${k + 1}: i = ${coef} fora de ${Number(par.laje.relacaoNegPosMin.toFixed(2))} a ${Number(par.laje.relacaoNegPosMax.toFixed(2))}; vale o do engaste.`,
        );
        return;
      }
      // corrigido: sem o CINT, como o R3 na otimização
      sl.codigos[k] = modo === "original" ? qbCint(10 * c + 2) : 2 + 10 * c;
    }),
  );

  // negativas impostas na continuidade (A_11e0(c,4)), pelo lado de qualquer das lajes
  continuidades = continuidades.map((c) => {
    const lado = (nome: string | null, k: number) =>
      pav.lajes.find((x) => x.nome === nome)?.negativasImpostas?.[k] ?? null;
    const n = lado(c.lajeA, c.bordoA) ?? lado(c.lajeB, c.bordoB);
    const codigo = n && codigoDaBarra(n, "lajecalc", par, avisos);
    return codigo ? { ...c, armaduraImposta: codigo } : c;
  });

  // LAJECALC 4: H da obra imposto (regrava o peso próprio = H·densidade/100); a
  // pré-moldada não tem H no LAJECALC (só os tipos 0 e 3)
  lajes = lajes.map((l, i) => {
    if (l.tipo === 1) return l;
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

/** Vínculo da V2 de cada bordo a partir dos códigos dos lados do original: engastado
 *  se algum lado do bordo é engastado, livre se todos são livres, senão apoiado. */
export function vinculosDosCodigos(codigos: readonly number[], bordos: readonly Bordo[]) {
  const v = {} as Record<Bordo, Vinculo>;
  for (const b of BORDOS_ORIGINAL) {
    const cs = codigos.filter((_, k) => bordos[k] === b);
    v[b] = cs.some((c) => c > 2)
      ? "engastado"
      : cs.length > 0 && cs.every((c) => c === 1)
        ? "livre"
        : "apoiado";
  }
  return v;
}

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
  const l = pav.lajes.find((q) =>
    q.poligono
      ? dentroDoPoligono({ x, y }, q.poligono)
      : x > q.x && x < q.x + q.lx && y > q.y && y < q.y + q.ly,
  );
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
  // o peso digitado (kN/m → t/m) ou o da seção
  const tPorM = (v: (typeof pav.vigas)[number]) =>
    v.pesoProprio !== undefined ? knPorMParaTPorM(v.pesoProprio) : ((v.bw * v.h) / 10_000) * dens;
  const kg = new Map(pav.vigas.map((v) => [v.nome, pesoKgPorM(s(tPorM(v)))]));
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

/** Pilares do LAJEGEOM (A_1156) para a montagem, só quando o pavimento tem
 *  pilar-parede: o trecho dele e, nos outros, o ponto do centro. Sem pilar-parede, a
 *  montagem usa os pilares dos eixos, como antes. */
function geometriaDosPilares(pav: Pavimento, modo: ModoSistrut): PilarMontagem[] | undefined {
  const trechos = pav.trechosPilares ?? [];
  if (trechos.length === 0) return undefined;
  const s = atribuicao(modo);
  const pt = (p: Ponto) => ({ x: s(p.x), y: s(p.y) });
  return pav.pilares.map((p) => {
    const t = trechos.find((x) => x.pilar === p.id);
    return { nome: p.nome, inicio: pt(t?.inicio ?? p), fim: pt(t?.fim ?? p) };
  });
}

// ---------------------------------------------------------------- pavimento

function calcularPavimentoSistrut(
  pav: Pavimento,
  mat: MateriaisSistrut,
  par: ParametrosSistrut,
  modo: ModoSistrut,
  otimiza: boolean,
  matViga: MateriaisSistrut = mat,
): PavimentoSistrut {
  const s = atribuicao(modo);
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const { painel, lajesDoPainel } = painelDoPavimento(pav, par, modo, avisos);

  // alvenarias: a carga linear de cada viga sobre o eixo dela
  for (const v of pav.vigas)
    if (v.cargaLinear > 0 && !v.somenteCargasProprias)
      painel.alvenarias.push({
        inicio: { x: s(v.x1), y: s(v.y1) },
        fim: { x: s(v.x2), y: s(v.y2) },
        carga: s(knPorMParaTPorM(v.cargaLinear)),
      });
  // alvenarias em qualquer posição (LAJEGEOM 3): sobre laje, a montagem as distribui
  for (const a of pav.alvenarias ?? [])
    painel.alvenarias.push({
      inicio: { x: s(a.inicio.x), y: s(a.inicio.y) },
      fim: { x: s(a.fim.x), y: s(a.fim.y) },
      carga: s(knPorMParaTPorM(a.carga)),
    });
  // γ das lajes (matL): os do .LAP (LAJE 7), que a obra pode editar; vigas e pilares
  // seguem com `mat` (os γ de fábrica de PARAMETROS_LAJE)
  const matL: MateriaisSistrut = {
    ...mat,
    gamaF: par.laje.gamaF,
    gamaC: par.laje.gamaC,
    gamaS: par.laje.gamaS,
  };

  // LAJECALC 5 (antes da otimização) e LAJECALC 3 (espessura mínima)
  // no original, a falha de execução numa laje para a opção 5 "todas" (e a 3)
  const paraNaFalha = modo === "original";
  const esforcosAntesOtimizacao = esforcosDoPainelCom(undefined, paraNaFalha)(
    painel,
    par.laje,
    modo,
  );
  const espessuras: Record<string, EspessuraDeLaje> = {};
  for (const l of esforcosAntesOtimizacao.lajes) {
    const prep = esforcosAntesOtimizacao.preparadas[l.nome];
    const coef = esforcosAntesOtimizacao.coeficientes[l.nome];
    if (!prep || !coef) continue;
    const pv = pav.lajes.find((q) => q.nome === l.nome);
    const vaos = lajesDoPainel.find((d) => d.nome === l.nome)?.vaosFlecha;
    const flecha: DadosFlechaLaje | undefined = pv && {
      lx: vaos?.lx ?? pv.lx,
      ly: vaos?.ly ?? pv.ly,
      vinculos: vinculosDosCodigos(
        l.codigos,
        lajesDoPainel.find((d) => d.nome === l.nome)?.bordos ?? BORDOS_ORIGINAL,
      ),
      acidental: knPorM2ParaTPorM2(pv.sobrecarga + ocupacaoDaLaje(pv, pav).acidental),
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
        matL,
        par.laje,
        modo,
        flecha,
      );
    } catch (e) {
      avisos.push(`${l.nome}: espessura mínima não calculada (${mensagem(e)})`);
    }
  }

  // LAJECALC 6: otimização dos negativos. No original é um passo que o usuário roda;
  // aqui roda por padrão (decisão 4 do dono) e `Obra.otimizaNegativos = false` o pula.
  let esforcos = esforcosAntesOtimizacao;
  let otimizacaoParada: OtimizacaoParada | undefined;
  if (otimiza) {
    try {
      esforcos = esforcosDoPainelCom(
        (e, recalcula) => otimizaNegativos(e, recalcula, matL, par.laje, modo),
        paraNaFalha,
      )(painel, par.laje, modo);
    } catch (e) {
      if (e instanceof ErroNaoConverge && ehOtimizacaoParada(e.estado)) otimizacaoParada = e.estado;
      avisos.push(
        `Otimização dos negativos não feita: ${mensagem(e)} Valem os momentos antes da otimização.`,
      );
    }
  }
  const armadurasDe = (e: EsforcosLajes) =>
    Object.fromEntries(
      Object.entries(e.momentos).map(([nome, m]) => [nome, armadurasLaje(m, matL, par.laje, modo)]),
    );
  const armadurasAntesOtimizacao = armadurasDe(esforcosAntesOtimizacao);
  const armaduras = armadurasDe(esforcos);
  const proc = lajeproc(esforcos, matL, par.laje, modo);

  // LAJEMONT: reações das lajes e .VIG
  const geo = geometriaDasVigas(pav);
  avisos.push(...geo.avisos);
  const eixos = eixosDasVigas(geo.vigas, modo);
  const idVigas = Object.fromEntries(geo.vigas.map((g) => [g.viga.nome, g.viga.id]));
  const montagem = montaPavimento(
    esforcos,
    painel,
    eixos,
    () => null,
    pesosDasVigas(pav, modo),
    par.laje,
    modo,
    geometriaDosPilares(pav, modo),
  );

  // o .VIG editado pela obra (o que o usuário digita no VIGA)
  const vig = montagem.vigas.map((d) => {
    const v = pav.vigas.find((x) => x.nome === d.nome);
    return v ? editaVig(d, v, par.viga, modo, avisos) : d;
  });

  // VIGA: análise (VICALC) e .REP
  const { analises, naoProcessadas, vigas: vigasVig } = analisaVigas(vig, par.viga, modo);
  if (naoProcessadas.length > 0)
    avisos.push(
      `Vigas não processadas pelo VIGA (carga indexada sem origem): ${naoProcessadas.join(", ")}.`,
    );
  const processadas = new Set(analises.map((a) => a.nome));
  for (const v of pav.vigas)
    if (!processadas.has(v.nome) && !naoProcessadas.includes(v.nome))
      avisos.push(`Viga ${v.nome} sem apoios suficientes no LAJEMONT: não calculada.`);
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
    const avisosForma: string[] = [];
    const { secoes, forma, apoios, eixos } = secoesEFormaDaObra(
      g.viga,
      dados,
      secoesEForma(g, dados, pav),
      modo,
      avisosForma,
    );
    const entrada: EntradaDesdim = {
      viga: dados,
      secoes,
      forma,
      materiais: matViga,
      parametros: par.dsp,
    };
    const v: VigaSistrut = { id: g.viga.id, nome: dados.nome, entrada, avisos: avisosForma };
    try {
      v.dimensionamento = dimensionaViga(entrada, modo);
      v.detalhamento = detalhaViga(entrada, v.dimensionamento, modo, {
        apoios,
        ...(eixos ? { eixos } : {}),
      });
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
    armadurasAntesOtimizacao,
    armaduras,
    lajeproc: proc,
    eixos,
    idVigas,
    geometriaVigas: geo.vigas,
    montagem,
    vigasVig,
    vig,
    analises,
    naoProcessadas,
    rep,
    vigas,
    avisos,
    memoria,
    ...(otimizacaoParada ? { otimizacaoParada } : {}),
  };
}

/** O estado do `ErroNaoConverge` da otimização dos negativos (a tela parada do R3). */
const ehOtimizacaoParada = (x: unknown): x is OtimizacaoParada =>
  typeof x === "object" && x !== null && "relacaoNova" in x && "lados" in x;

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
  falhas: ResultadoSistrut["falhas"],
) {
  const s = atribuicao(modo);
  const niveis = niveisDoEdificio(obra);
  const porId = new Map(pavimentos.map((p) => [p.pavimentoId, p]));
  // colunas: posição de pilar do nível mais baixo, subindo enquanto o pilar existir
  const chaves: string[] = [];
  for (const { pav } of niveis)
    for (const p of pav.pilares) if (!chaves.includes(chavePilar(p))) chaves.push(chavePilar(p));
  const colunas: ColunaEdificio[] = [];
  /** Lances de cada coluna (mesmo índice de `colunas`): pilar e nível de baixo. */
  const lancesDasColunas: { pilar: Pilar; nivel: number }[][] = [];
  chaves.forEach((chave, i) => {
    const lances: { pilar: Pilar; nivel: number }[] = [];
    for (const [k, { pav }] of niveis.entries()) {
      const p = pav.pilares.find((q) => chavePilar(q) === chave);
      if (!p) break;
      lances.push({ pilar: p, nivel: k });
    }
    if (lances.length === 0) return;
    // nome com o número da coluna: o PILGEEDI casa o .REP pelo número no nome
    const nome = `P ${i + 1}`;
    let cota = 0;
    // seção, vínculos, excentricidade e vento do lance no nível da base (pilaresDaObra.ts)
    const nvs: NivelColuna[] = [];
    for (const l of lances) {
      nvs.push(nivelDoPilar(l.pilar, cota, modo));
      cota += niveis[l.nivel]!.pav.peDireito;
    }
    nvs.push(nivelDoPilar(lances.at(-1)!.pilar, cota, modo, true));
    // Pilar.cargaTopo: carga do nível do topo de cada lance (A_1280)
    lances.forEach((l, k) => {
      const carga = cargaDoNivel(l.pilar, modo);
      if (carga) nvs[k + 1]!.cargaAdicional = carga;
    });
    colunas.push({ nome, pilarRep: nome, niveis: nvs });
    lancesDasColunas.push(lances);
  });

  // pilar fora de coluna: não chega à fundação (falta num pavimento de baixo)
  const naColuna = new Set(lancesDasColunas.flat().map((l) => `${l.nivel}|${l.pilar.id}`));
  const falha = (pavimentoId: string, texto: string) => {
    if (!falhas.some((f) => f.pavimentoId === pavimentoId && f.texto === texto))
      falhas.push({ pavimentoId, texto });
  };
  for (const [k, { pav }] of niveis.entries())
    for (const p of pav.pilares)
      if (!naColuna.has(`${k}|${p.id}`))
        falha(
          pav.id,
          `Pilar ${p.nome} do pavimento ${pav.nome} não continua até a fundação (falta num pavimento de baixo): o PILAREDI não o dimensiona e a carga dele não chega à fundação — modele a transição.`,
        );

  // .REP de cada nível (o do pavimento, com o nome do pilar trocado pelo da coluna)
  const reps: LeituraRep[] = [];
  for (const [k, { pav }] of niveis.entries()) {
    const ps = porId.get(pav.id);
    if (!ps) continue;
    const linhas = ps.rep.flatMap((linha) => {
      const p = pav.pilares.find((q) => q.nome === linha.pilar);
      const c = p
        ? colunas.find((_, i) =>
            lancesDasColunas[i]!.some((l) => l.pilar.id === p.id && l.nivel === k),
          )
        : undefined;
      if (!c) {
        falha(
          pav.id,
          `Carga de ${linha.total.toFixed(2)} t do pilar ${linha.pilar} no .REP do pavimento ${pav.nome} não foi levada a nenhuma coluna: não chega à fundação.`,
        );
        return [];
      }
      // Corrigido: a inclinação e a rigidez da viga, que o original deixa em 0 até o
      // usuário digitar no PILGEEDI (PILGEEDI.BAS:597-640): com 0, o momento de uma viga
      // vertical entra na direção x e o pilar leva 100 % do MEP (kViga = 0 na
      // repartição por rigidez de PILAREDI.BAS:7470-7520).
      const momentos =
        modo === "original"
          ? linha.momentos
          : linha.momentos.map((m) => {
              const v = pav.vigas.find((x) => x.nome === m.viga);
              if (!v) return m;
              const horizontal = Math.abs(v.y1 - v.y2) < 1e-9;
              return { ...m, inclinacao: horizontal ? 0 : 90, rigidez: (v.bw * v.h ** 3) / 12 };
            });
      // o PILGEEDI lê o total do texto do .REP, gravado com PRINT USING "#####.##"
      // (VIGA.BAS:2545; PILGEEDI.BAS:541-544: N = VAL(MID$(L1, 10))): 17,3699989 da soma
      // em SINGLE vira VAL("17.37") = 17,3700008
      const total = s(qbVal(qbUsing("#####.##", linha.total)));
      return [{ ...linha, pilar: c.nome, total, momentos }];
    });
    // o nível k do .REP é o topo do lance k − 1: carga no nível k + 1 da coluna
    reps.push({ linhas, nivelInicial: k + 1, nivelFinal: k + 1, modo: "substitui" });
  }

  // PILAREDI 3.1: predimensionamento; com "secao", o quadrado vira a seção da coluna
  const predimensionamentos: PredimensionamentoSistrut[] = [];
  const opcaoPredim = obra.parametrosPilar?.predimensionamento;
  if (opcaoPredim)
    colunas.forEach((coluna, i) => {
      const p = predimensionaColuna(
        reps,
        coluna,
        lancesDasColunas[i]![0]!.pilar.id,
        mat,
        par,
        modo,
        opcaoPredim,
      );
      predimensionamentos.push(p);
      const secao = p.resultado?.secao;
      if (opcaoPredim === "secao" && secao) {
        for (const n of coluna.niveis) n.secao = secao;
        p.avisos.push(
          `${lancesDasColunas[i]![0]!.pilar.nome}: seção do predimensionamento (${p.resultado!.b} × ${p.resultado!.h} cm) no lugar da seção da obra.`,
        );
      }
    });

  const cargas = cargasPilares(reps, colunas, par.pip, modo, {
    medida: par.pilar.coeficienteMedida,
    forca: par.pilar.coeficienteForca,
  });
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
    // a seção do predimensionamento vale em todos os lances da coluna: o aviso também
    const predim = predimensionamentos.find((p) => p.coluna === coluna.nome);
    if (predim?.modo === "secao" && predim.resultado)
      l.avisos.push(
        `${lance.pilar.nome}: dimensionado com a seção do predimensionamento, ${predim.resultado.b} × ${predim.resultado.h} cm, no lugar da seção da obra.`,
      );
    try {
      l.dimensionamento = dimensionaPilar(carga, coluna, mat, par.pilar, par.pip, modo);
    } catch (e) {
      l.avisos.push(`${lance.pilar.nome}: dimensionamento não concluído: ${mensagem(e)}`);
    }
    lances.push(l);
  }

  // PILAR opção 6: as verificações de seção dada de cada pilar
  const verificacoes = obra.pavimentos.flatMap((pav) =>
    pav.pilares.flatMap((p) =>
      verificacoesDoPilar(
        p,
        pav.id,
        lances
          .filter((l) => l.pavimentoId === pav.id && l.pilarId === p.id)
          .map((l) => ({
            ...l,
            secao: colunas.find((c) => c.nome === l.coluna)!.niveis[l.nivel]!.secao,
          })),
        mat,
        par.pilar,
        modo,
      ),
    ),
  );
  const fundacoes = colunas.map((c, i) => ({
    coluna: c.nome,
    pilarId: lancesDasColunas[i]![0]!.pilar.id,
    ...resumoFundacao(reps, c, par.pip, modo),
  }));
  return { colunas, lances, verificacoes, predimensionamentos, fundacoes };
}

// ---------------------------------------------------------------- obra

/** Calcula a obra pelo caminho do SISTRUT 4.0 (NB-1/78), no modo dado. Resultado nas
 *  unidades do original. */
export function calcularObraSistrut(obra: Obra, opcoes: { modo: ModoSistrut }): ResultadoSistrut {
  const { modo } = opcoes;
  const mat = materiaisSistrut(obra.materiais, modo);
  const parBase = parametrosSistrut(obra.materiais, modo, obra.parametrosViga);
  const par = { ...parBase, ...parametrosPilarDaObra(parBase, obra.parametrosPilar, modo) };
  aplicaParametrosLaje(par, obra.parametrosLaje, modo);
  const matPilar = materiaisPilar(mat, obra.parametrosPilar, modo);
  const matViga = materiaisDaViga(mat, obra.parametrosViga, modo);
  const avisos: string[] = [];
  if (obra.materiais.aco === "CA-25" && obra.materiais.classeAco === "B")
    avisos.push("Aço CA-25 é sempre classe A; a classe B informada foi ignorada.");
  const otimiza = obra.otimizaNegativos ?? true;
  const pavimentos = obra.pavimentos.map((p) =>
    calcularPavimentoSistrut(p, mat, par, modo, otimiza, matViga),
  );
  const falhas: ResultadoSistrut["falhas"] = [];
  const { colunas, lances, verificacoes, predimensionamentos, fundacoes } = calcularPilaresSistrut(
    obra,
    pavimentos,
    matPilar,
    par,
    modo,
    falhas,
  );
  const quadros = pavimentos.flatMap((p) => p.vigas.flatMap((v) => (v.quadro ? [v.quadro] : [])));
  return {
    modo,
    materiais: mat,
    parametros: par,
    pavimentos,
    colunas,
    lances,
    quadros,
    falhas,
    resumoVigas: resumoGeralVigas(quadros, par.dsp, modo),
    avisos,
    materiaisPilar: matPilar,
    verificacoes,
    predimensionamentos,
    fundacoes,
  };
}
