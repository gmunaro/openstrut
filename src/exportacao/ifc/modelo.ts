// Modelo BIM da obra, antes do STEP: níveis (um por repetição de pavimento), pilares,
// vigas e lajes com a geometria em metros e as propriedades que vão aos Psets, e a
// armadura detalhada como barras no sistema local de cada elemento. Funções puras: o
// escritor (escrever.ts) só traduz este modelo para entidades IFC, e os testes conferem
// níveis, dimensões e contagens aqui sem ler STEP.
//
// Convenções (docs/IFC.md):
// - z = 0 do pavimento é o nível dele (topo da laje); a elevação do nível é a soma dos
//   pés-direitos da base até ele. O pilar do pavimento é o lance que vai do nível de
//   baixo até o dele, como no motor (dominio/obra.ts, Pilar). No IFC ele fica no storey
//   da base (o nível de baixo; a fundação no primeiro), de z = 0 ao pé-direito: Revit e
//   ArchiCAD tomam o storey que contém o pilar como o nível de base dele.
// - Pavimento-tipo: um nível por repetição; a repetição 1 é a de cima, como em
//   calculo/pilares/acumulacao.ts.
// - Viga: topo no nível, extrudada ao longo do eixo; sistema local com x no eixo (do
//   ponto de menor coordenada para o de maior), z para cima e o topo em z = 0.
// - Pilar: sistema local no centro da seção, girado de `rotacao`, com a base em z = 0.
import type {
  ResultadoLaje,
  ResultadoObra,
  ResultadoPilar,
  ResultadoViga,
} from "../../calculo/fluxo";
import type { PosicaoBarra, TrechoEstribo } from "../../calculo/sistrut/base/tipos";
import {
  armaduraPilar,
  armaduraViga,
  type BarraViga,
  barrasDaV2,
  type P3,
  type PerfilSecao,
  type PosicaoGeometria,
  perfilPilar,
} from "../../dominio/armaduraGeometria";
import { eixoDaViga } from "../../dominio/gerar";
import { deduzirApoiosEscada, type NivelPredio, pavimentoDeVigasAvulsas } from "./escada";
import type { Laje, Obra, Pavimento, Pilar, Ponto, Viga } from "../../dominio/obra";
import type { DetalhamentoVigasObra } from "../../telas/detalhamento";

/** Valor de propriedade: número sai IfcReal; `{ inteiro }` IfcInteger; texto IfcLabel
 *  (IfcText se passar de 255 caracteres); booleano IfcBoolean. */
export type ValorPropriedade = number | string | boolean | { inteiro: number };
export type Propriedades = Record<string, ValorPropriedade>;

export interface NivelIfc {
  /** Chave estável do nível (GlobalId). */
  chave: string;
  nome: string;
  /** Elevação do nível, m. */
  elevacao: number;
  descricao?: string;
  pavimento?: Pavimento;
  /** 1 = a repetição de cima. */
  repeticao?: number;
  /** Nível da escada sem cota deduzível (em 0, fora da planta). */
  cotaIncerta?: boolean;
}

/** Posição de armadura como o escritor a recebe: a do domínio, com a longitudinal do
 *  pilar já levada a "positiva" (barra MAIN, "Armadura positiva" no IFC). */
export type PosicaoIfc = PosicaoGeometria & {
  tipo: Exclude<PosicaoGeometria["tipo"], "longitudinal">;
};

interface ElementoBase {
  chave: string;
  nome: string;
  nivel: NivelIfc;
  descricao?: string;
  /** Pset OpenStrut_Dados. */
  propriedades: Propriedades;
  armadura: PosicaoIfc[];
}

export interface PilarIfc extends ElementoBase {
  tipo: "pilar";
  /** Centro da seção no plano, m, e rotação, rad. */
  x: number;
  y: number;
  rotacao: number;
  /** Base do lance relativa ao nível dele (o de baixo do pavimento: 0) e altura, m. */
  base: number;
  altura: number;
  perfil: PerfilSecao;
}

export interface TrechoVigaIfc {
  /** Ao longo do eixo, m, a partir da origem da viga. */
  inicio: number;
  fim: number;
  perfil: Extract<PerfilSecao, { tipo: "retangulo" | "T" }>;
}

export interface VigaIfc extends ElementoBase {
  tipo: "viga";
  /** Origem do eixo (z relativo ao nível) e direção unitária; z ≠ 0 só na escada, que
   *  vai inclinada de um nível ao outro. */
  origem: P3;
  direcao: P3;
  comprimento: number;
  trechos: TrechoVigaIfc[];
  /** Viga avulsa do SISTRUT (escada calculada à parte no VIGA). */
  escada: boolean;
}

export interface LajeIfc extends ElementoBase {
  tipo: "laje";
  /** Contorno anti-horário no plano, m. */
  pontos: { x: number; y: number }[];
  espessura: number;
}

export type ElementoIfc = PilarIfc | VigaIfc | LajeIfc;

export interface ModeloIfc {
  nome: string;
  niveis: NivelIfc[];
  elementos: ElementoIfc[];
  /** "Concreto C25". */
  concreto: string;
  /** OpenStrut_Dados do projeto: norma, materiais e se a obra foi calculada. */
  propriedades: Propriedades;
  /** Avisos do exportador (o que não entrou ou foi aproximado). */
  avisos: string[];
}

export interface OpcoesModelo {
  /** Inclui as barras detalhadas (vigas e pilares). Padrão: sim. */
  armadura?: boolean;
}

/** O que o exportador usa do cálculo: o resultado e o detalhamento das vigas da V2. */
export interface CalculoIfc {
  resultado: ResultadoObra;
  detalhamento: DetalhamentoVigasObra | null;
}

const NOMES_NORMA = { "nb1-78": "NB-1/78", "nbr6118-2023": "NBR 6118:2023" } as const;
const r2 = (v: number) => Math.round(v * 100) / 100;
const decimal = (v: number) => String(r2(v)).replace(".", ",");

export { pavimentoDeVigasAvulsas } from "./escada";

/** Níveis da obra, da base para o topo: a fundação em 0 e um por repetição de pavimento,
 *  na soma dos pés-direitos. O pavimento de vigas avulsas (escada) não tem cota e fica
 *  fora da pilha: as vigas dele vão ao nível de baixo dos que ligam (modeloIfc). */
export function niveisDaObra(obra: Obra): NivelIfc[] {
  const niveis: NivelIfc[] = [{ chave: "fundacao", nome: "Fundação", elevacao: 0 }];
  let z = 0;
  for (const pav of [...obra.pavimentos].reverse()) {
    if (pavimentoDeVigasAvulsas(pav)) continue;
    const n = Math.max(1, Math.floor(pav.repeticoes));
    for (let r = n; r >= 1; r--) {
      z += pav.peDireito;
      niveis.push({
        chave: `${pav.id}|${r}`,
        nome: n > 1 ? `${pav.nome} (${r}/${n})` : pav.nome,
        elevacao: z,
        pavimento: pav,
        repeticao: r,
      });
    }
  }
  return niveis;
}

// ---- perfis ----------------------------------------------------------------------

/** Anti-horário (área com sinal positiva). */
function antiHorario<T extends { x: number; y: number }>(pontos: readonly T[]): T[] {
  const area = pontos.reduce((a, p, k) => {
    const q = pontos[(k + 1) % pontos.length]!;
    return a + p.x * q.y - q.x * p.y;
  }, 0);
  return area < 0 ? [...pontos].reverse() : [...pontos];
}

const rotuloSecaoPilar = (p: Pilar) =>
  p.secao?.tipo === "circular"
    ? `circular d = ${decimal(p.secao.d)} cm${p.secao.dInterno > 0 ? `, vazado d = ${decimal(p.secao.dInterno)} cm` : ""}`
    : p.secao?.tipo === "poligonal"
      ? `poligonal, ${p.secao.vertices.length} vértices, caixa ${decimal(p.b)} × ${decimal(p.h)} cm`
      : `${decimal(p.b)} × ${decimal(p.h)} cm`;

/** Perfil de um trecho de viga, m: T quando a seção do DESENHO tem mesa mais larga que
 *  a alma; senão retângulo. */
function perfilViga(s: { bw: number; h: number; bf?: number; hf?: number }) {
  if (s.bf && s.hf && s.bf > s.bw && s.hf > 0 && s.hf < s.h)
    return {
      tipo: "T" as const,
      altura: s.h / 100,
      mesa: s.bf / 100,
      espessuraMesa: s.hf / 100,
      alma: s.bw / 100,
    };
  return { tipo: "retangulo" as const, largura: s.bw / 100, altura: s.h / 100 };
}

/** Eixo da viga: origem no ponto de menor coordenada ao longo dele (o primeiro nó da
 *  montagem), direção unitária e comprimento, m. Viga inclinada: de (x1, y1) a (x2, y2). */
export function eixoIfc(v: Viga) {
  const e = eixoDaViga(v);
  if (e)
    return {
      origem: e.horizontal ? { x: e.s1, y: e.c, z: 0 } : { x: e.c, y: e.s1, z: 0 },
      direcao: e.horizontal ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 },
      comprimento: e.s2 - e.s1,
      s1: e.s1,
    };
  const dx = v.x2 - v.x1;
  const dy = v.y2 - v.y1;
  const L = Math.hypot(dx, dy);
  return {
    origem: { x: v.x1, y: v.y1, z: 0 },
    direcao: { x: dx / L, y: dy / L, z: 0 },
    comprimento: L,
    s1: 0,
  };
}

/** Nós da viga ao longo do eixo, m a partir da origem: os da montagem do cálculo; sem
 *  cálculo, os vãos digitados (`vaos`) quando somam o comprimento; senão as pontas. */
function nosDaViga(v: Viga, comprimento: number, s1: number, rv: ResultadoViga | undefined) {
  if (rv && rv.viga.nos.length >= 2) return rv.viga.nos.map((s) => s - s1);
  if (v.vaos && v.vaos.length > 0) {
    const soma = v.vaos.reduce((a, b) => a + b, 0);
    if (Math.abs(soma - comprimento) < 0.005) {
      const nos = [0];
      for (const l of v.vaos) nos.push((nos.at(-1) ?? 0) + l);
      return nos;
    }
  }
  return [0, comprimento];
}

/** Trechos da viga com a seção de cada um: a do DESENHO (`secoes.trechos`, T quando há
 *  mesa) quando há uma por tramo; senão bw × h na viga inteira. */
export function trechosDaViga(v: Viga, nos: readonly number[], comprimento: number) {
  const secoes = v.secoes?.trechos;
  const valida = (s: { bw: number; h: number } | undefined) => !!s && s.bw > 0 && s.h > 0;
  // seção 0 no .SEC: o balanço herda a do apoio vizinho, como o DESDIM; o tramo, bw × h
  const daPlanta = { bw: v.bw, h: v.h };
  const apoios = v.secoes?.apoios ?? [];
  const herdada = (k: number, n: number) => {
    const vizinho = k === 0 ? apoios[0] : k === n - 1 ? apoios.at(-1) : undefined;
    return valida(vizinho) ? { bw: vizinho!.bw, h: vizinho!.h } : daPlanta;
  };
  if (secoes && secoes.length === nos.length - 1 && secoes.length > 0)
    return secoes.map((s, k) => ({
      inicio: nos[k]!,
      fim: nos[k + 1]!,
      perfil: perfilViga(valida(s) ? s : herdada(k, secoes.length)),
    }));
  return [{ inicio: 0, fim: comprimento, perfil: perfilViga({ bw: v.bw, h: v.h }) }];
}

const rotuloPerfil = (p: TrechoVigaIfc["perfil"]) =>
  p.tipo === "T"
    ? `T: alma ${decimal(p.alma * 100)} × ${decimal(p.altura * 100)} cm, mesa ${decimal(p.mesa * 100)} × ${decimal(p.espessuraMesa * 100)} cm`
    : `${decimal(p.largura * 100)} × ${decimal(p.altura * 100)} cm`;

// ---- armadura -----------------------------------------------------------------------

/** Detalhamento do SISTRUT (DESINIT): início e fim a partir da face externa do primeiro
 *  apoio, cm (conferido na obra E2E do oráculo: positiva de 2 a 818 numa viga de 8 m com
 *  apoios de 20 cm). Os estribos saem dos trechos (`posicao` 1 = a primeira posição de
 *  estribo), um a cada espaçamento. */
function barrasSistrut(
  posicoes: readonly PosicaoBarra[],
  trechos: readonly TrechoEstribo[],
  origem: number,
): BarraViga[] {
  const posEstribo = posicoes.filter((p) => p.tipo === "estribo");
  // grampo: a travessa fecha na ponta do apoio, a mais perto da extremidade da viga
  const comprimentoViga = Math.max(0, ...posicoes.map((p) => p.fim));
  return posicoes.map((p) => {
    const tipo = p.tipo === "porta-estribo" ? "porta-estribos" : p.tipo;
    const base = {
      nome: p.nome,
      tipo,
      phi: p.bitola,
      quantidade: p.quantidade,
      comprimento: p.comprimento,
      inicio: origem + p.inicio / 100,
      fim: origem + p.fim / 100,
      ganchoInicio: p.dobras[0] / 100,
      ganchoFim: p.dobras[1] / 100,
      ...(p.tipo === "grampo"
        ? { travessa: p.inicio < comprimentoViga - p.fim ? ("inicio" as const) : ("fim" as const) }
        : {}),
    } satisfies BarraViga;
    if (p.tipo !== "estribo") return base;
    const k = posEstribo.indexOf(p) + 1;
    const estribos = trechos
      .filter((t) => t.posicao === k)
      .flatMap((t) =>
        Array.from({ length: t.quantidade }, (_, i) =>
          Math.min(origem + (t.inicio + i * t.espacamento) / 100, origem + t.fim / 100),
        ),
      );
    return { ...base, estribos };
  });
}

/** Seção no ponto t do eixo (o trecho que o contém). */
const secaoEm = (trechos: readonly TrechoVigaIfc[], t: number) => {
  const tr = trechos.find((x) => t >= x.inicio - 1e-6 && t <= x.fim + 1e-6) ?? trechos[0]!;
  const p = tr.perfil;
  return p.tipo === "T" ? { bw: p.alma, h: p.altura } : { bw: p.largura, h: p.altura };
};

/** Posições da geometria comum (dominio/armaduraGeometria.ts) para o IFC: a longitudinal
 *  do pilar sai como "positiva". */
const paraIfc = (pos: readonly PosicaoGeometria[]): PosicaoIfc[] =>
  pos.map((p) => ({ ...p, tipo: p.tipo === "longitudinal" ? "positiva" : p.tipo }));

// ---- propriedades dos resultados ---------------------------------------------------

const rotuloBarra = (b: { phi: number; espacamento: number }) =>
  `φ${decimal(b.phi)} c/${decimal(b.espacamento)}`;

/** Número não finito (seção sem solução dá NaN no cálculo) vira "sem solução": o Pset
 *  não pode mostrar um valor que não existe, e o STEP não tem NaN. */
const semNaN = (props: Propriedades): Propriedades =>
  Object.fromEntries(
    Object.entries(props).map(([k, v]) => [
      k,
      typeof v === "number" && !Number.isFinite(v) ? "sem solução" : v,
    ]),
  );

function propriedadesPilar(r: ResultadoPilar): Propriedades {
  const x = r.resultado;
  const avisos: Propriedades = {
    Avisos: { inteiro: x.avisos.length },
    ...(x.avisos.length > 0 ? { TextoAvisos: x.avisos.join(" | ") } : {}),
  };
  // lance sem solução (ou sem dimensionamento no SISTRUT): sem os zeros e NaN do cálculo
  if (x.barras.n <= 0) return { Nk_kN: r2(r.nk), Armadura: "sem solução", ...avisos };
  return {
    Nk_kN: r2(r.nk),
    Nd_kN: r2(x.nd),
    MdX_kNm: r2(x.mdX),
    MdY_kNm: r2(x.mdY),
    LambdaX: r2(x.lambdaX),
    LambdaY: r2(x.lambdaY),
    AsNecessaria_cm2: r2(x.asNecessaria),
    AsAdotada_cm2: r2(x.barras.area),
    Armadura: x.barras.n > 0 ? `${x.barras.n} φ${decimal(x.barras.phi)}` : "sem solução",
    Estribos: x.estribo.phi > 0 ? rotuloBarra(x.estribo) : "-",
    Taxa_pct: r2(x.taxa),
    ...avisos,
  };
}

/** Resultados da viga: Mk e Vk da envoltória; Md e Vd só com o γf do fluxo da V2
 *  (`gamaF`), que é o que dimensionou. No caminho do SISTRUT o DESDIM usa o γf do .DSP e
 *  o próprio M+, e `gamaF` vem null. */
function propriedadesViga(r: ResultadoViga, gamaF: number | null): Propriedades {
  if (!r.analise.ok || r.tramos.length === 0)
    return {
      Avisos: { inteiro: r.avisos.length },
      TextoAvisos: r.avisos.join(" | ") || "sem análise",
    };
  const ts = r.analise.tramos;
  const max = (xs: number[]) => (xs.every(Number.isFinite) ? Math.max(0, ...xs) : Number.NaN);
  const mPos = max(ts.map((t) => t.mPos));
  const mNeg = max(ts.flatMap((t) => [-t.mNegEsq, -t.mNegDir]));
  const v = max(ts.flatMap((t) => [Math.abs(t.vEsq), Math.abs(t.vDir)]));
  const barras = (s: { barras: { n: number; phi: number } | null }) =>
    s.barras ? `${s.barras.n} φ${decimal(s.barras.phi)}` : "-";
  return {
    MkPositivo_kNm: r2(mPos),
    MkNegativo_kNm: r2(mNeg),
    Vk_kN: r2(v),
    ...(gamaF !== null
      ? {
          MdPositivo_kNm: r2(gamaF * mPos),
          MdNegativo_kNm: r2(gamaF * mNeg),
          Vd_kN: r2(gamaF * v),
        }
      : {}),
    AsPositiva_cm2: r2(max(r.tramos.map((t) => t.positivo.flexao?.as ?? 0))),
    AsNegativa_cm2: r2(
      max(r.tramos.flatMap((t) => [t.negativoEsq.flexao?.as ?? 0, t.negativoDir.flexao?.as ?? 0])),
    ),
    ArmaduraTramos: r.tramos
      .map(
        (t, i) =>
          `T${i + 1}: inf ${barras(t.positivo)}, sup ${barras(t.negativoEsq)}/${barras(t.negativoDir)}`,
      )
      .join("; "),
    Estribos: r.tramos
      .map((t, i) => `T${i + 1}: ${t.estribo ? rotuloBarra(t.estribo) : "sem estribo"}`)
      .join("; "),
    Avisos: { inteiro: r.avisos.length },
    ...(r.avisos.length > 0 ? { TextoAvisos: r.avisos.join(" | ") } : {}),
  };
}

function propriedadesLaje(r: ResultadoLaje): Propriedades {
  const a = r.armadura;
  const avisos = [...r.esforcos.avisos, ...a.avisos];
  return {
    Mx_kNm_m: r2(r.esforcos.mx),
    My_kNm_m: r2(r.esforcos.my),
    Asx_cm2_m: r2(a.asx),
    Asy_cm2_m: r2(a.asy),
    ArmaduraX: a.barrasX.phi > 0 ? rotuloBarra(a.barrasX) : "-",
    ArmaduraY: a.barrasY.phi > 0 ? rotuloBarra(a.barrasY) : "-",
    // o caminho do SISTRUT não calcula flecha (limite 0): sem a propriedade, para o 0
    // não passar por resultado
    ...(r.esforcos.flechaLimite > 0
      ? { Flecha_cm: r2(r.esforcos.flecha), FlechaLimite_cm: r2(r.esforcos.flechaLimite) }
      : {}),
    Avisos: { inteiro: avisos.length },
    ...(avisos.length > 0 ? { TextoAvisos: avisos.join(" | ") } : {}),
  };
}

// ---- obra --------------------------------------------------------------------------

const contornoLaje = (l: Laje): Ponto[] =>
  antiHorario(
    l.poligono && l.poligono.length >= 3
      ? l.poligono
      : [
          { x: l.x, y: l.y },
          { x: l.x + l.lx, y: l.y },
          { x: l.x + l.lx, y: l.y + l.ly },
          { x: l.x, y: l.y + l.ly },
        ],
  );

/** Largura do primeiro apoio da viga na direção dela, m: a LPi do .FOR quando há (a que
 *  o DESINIT usa), senão a da planta (pilar b ou h, viga bw); ponta livre 0. */
function larguraPrimeiroApoio(rv: ResultadoViga, pav: Pavimento, v: Viga) {
  const a = rv.viga.apoios[0];
  if (!a || a.tipo === "livre") return 0;
  const doFor = v.forma?.apoios?.[0]?.largura;
  if (doFor !== undefined && doFor > 0) return doFor / 100;
  if (a.tipo === "viga") return (pav.vigas.find((x) => x.id === a.id)?.bw ?? 0) / 100;
  const p = pav.pilares.find((x) => x.id === a.id);
  return p ? (rv.viga.eixo.horizontal ? p.b : p.h) / 100 : 0;
}

/** Modelo BIM da obra. Com `calculo`, os resultados entram no Pset OpenStrut_Dados e, com
 *  `opcoes.armadura` (padrão), as barras detalhadas das vigas e dos pilares. */
export function modeloIfc(
  obra: Obra,
  calculo: CalculoIfc | null,
  opcoes: OpcoesModelo = {},
): ModeloIfc {
  const comArmadura = opcoes.armadura ?? true;
  const m = obra.materiais;
  const resultado = calculo?.resultado;
  const gamaF = resultado ? Math.max(resultado.norma.gamaG, resultado.norma.gamaQ) : 1;
  const concreto = `Concreto C${decimal(m.fck)}`;
  const avisos: string[] = [];
  const comuns = (cobrimento: number): Propriedades => ({
    Concreto: concreto,
    fck_MPa: m.fck,
    Aco: m.aco,
    AcoEstribo: m.acoEstribo,
    Cobrimento_cm: cobrimento,
    Norma: NOMES_NORMA[obra.norma],
    ...(obra.norma === "nb1-78" ? { ModoCalculo: obra.modoCalculo } : {}),
    Calculado: resultado !== undefined,
  });

  const niveis = niveisDaObra(obra);
  const elementos: ElementoIfc[] = [];
  const semArmaduraPoligonal = new Set<string>();
  const doNivel = (pav: Pavimento, nivel: NivelIfc) => ({ Pavimento: pav.nome, Nivel: nivel.nome });

  /** Viga com os trechos, as barras e o Pset. `escada.inclinada`: do apoio 0 ao apoio 1
   *  deduzidos (z relativo ao nível); o comprimento passa a ser o do eixo inclinado, e as
   *  abscissas dos trechos e das barras crescem na mesma proporção. */
  const vigaIfc = (
    v: Viga,
    pav: Pavimento,
    nivel: NivelIfc,
    escada?: { chave: string; inclinada?: { de: P3; ate: P3 }; propriedades: Propriedades },
  ): VigaIfc | undefined => {
    if (Math.hypot(v.x2 - v.x1, v.y2 - v.y1) < 1e-6) return undefined;
    const rp = resultado?.pavimentos.find((x) => x.pavimento.id === pav.id);
    const sistrutPav = resultado?.sistrut?.pavimentos.find((x) => x.pavimentoId === pav.id);
    const eixo = eixoIfc(v);
    const rv = rp?.vigas.find((x) => x.viga.id === v.id);
    const nos = nosDaViga(v, eixo.comprimento, eixo.s1, rv);
    let trechos = trechosDaViga(v, nos, eixo.comprimento);
    let armadura: PosicaoIfc[] = [];
    if (comArmadura && rv) {
      const vs = sistrutPav?.vigas.find((x) => x.id === v.id);
      const origem = nos[0] ?? 0;
      let barras: BarraViga[] = [];
      if (vs?.detalhamento)
        barras = barrasSistrut(
          vs.detalhamento.posicoes,
          vs.detalhamento.trechosEstribo,
          origem - larguraPrimeiroApoio(rv, pav, v) / 2,
        );
      else {
        const dv = calculo?.detalhamento?.vigas.find(
          (x) => x.pavimentoId === pav.id && x.vigaId === v.id,
        );
        if (dv) barras = barrasDaV2(dv.detalhamento.posicoes, origem);
      }
      armadura = paraIfc(
        armaduraViga(barras, (t) => secaoEm(trechos, t), m.cobrimentoViga, m.aco, m.acoEstribo),
      );
    }
    let { origem, direcao, comprimento } = eixo;
    const inc = escada?.inclinada;
    if (inc) {
      const d = { x: inc.ate.x - inc.de.x, y: inc.ate.y - inc.de.y, z: inc.ate.z - inc.de.z };
      const L = Math.hypot(d.x, d.y, d.z);
      const f = L / eixo.comprimento;
      const esticar = (p: P3) => ({ ...p, x: p.x * f });
      origem = inc.de;
      direcao = { x: d.x / L, y: d.y / L, z: d.z / L };
      comprimento = L;
      trechos = trechos.map((t) => ({ ...t, inicio: t.inicio * f, fim: t.fim * f }));
      armadura = armadura.map((p) => ({
        ...p,
        forma: p.forma.map(esticar),
        copias: p.copias.map(esticar),
      }));
    }
    return {
      tipo: "viga",
      chave: escada?.chave ?? `${nivel.chave}|viga|${v.id}`,
      nome: v.nome,
      nivel,
      origem,
      direcao,
      comprimento,
      trechos,
      escada: escada !== undefined,
      ...(escada ? { descricao: "Escada: viga avulsa importada do SISTRUT (.VIG sem .LAJ)" } : {}),
      propriedades: semNaN({
        Nome: v.nome,
        ...doNivel(pav, nivel),
        Secao: [...new Set(trechos.map((t) => rotuloPerfil(t.perfil)))].join("; "),
        Vao_m: r2(comprimento),
        Tramos: { inteiro: Math.max(1, nos.length - 1) },
        CargaLinear_kN_m: v.cargaLinear,
        Escada: escada !== undefined,
        ...escada?.propriedades,
        ...comuns(m.cobrimentoViga),
        ...(rv ? propriedadesViga(rv, resultado?.norma.caminho === "sistrut" ? null : gamaF) : {}),
      }),
      armadura,
    };
  };

  // nível de baixo do pavimento atual: a base dos pilares dele
  let abaixo = niveis[0]!;
  for (const nivel of niveis) {
    const pav = nivel.pavimento;
    if (!pav) continue;
    const rp = resultado?.pavimentos.find((x) => x.pavimento.id === pav.id);
    const base = abaixo;
    abaixo = nivel;

    // lajes: polígono com a espessura, topo no nível
    for (const l of pav.lajes) {
      const rl = rp?.lajes.find((x) => x.laje.id === l.id);
      elementos.push({
        tipo: "laje",
        chave: `${nivel.chave}|laje|${l.id}`,
        nome: l.nome,
        nivel,
        pontos: contornoLaje(l),
        espessura: l.h / 100,
        propriedades: semNaN({
          Nome: l.nome,
          ...doNivel(pav, nivel),
          Espessura_cm: l.h,
          TipoLaje: l.tipo ?? "macica",
          Revestimento_kN_m2: l.revestimento,
          Sobrecarga_kN_m2: l.sobrecarga,
          ...comuns(m.cobrimentoLaje),
          ...(rl ? propriedadesLaje(rl) : {}),
        }),
        armadura: [],
      });
    }

    // vigas: eixo, trechos com a seção de cada tramo, barras do detalhamento
    for (const v of pav.vigas) {
      const e = vigaIfc(v, pav, nivel);
      if (e) elementos.push(e);
    }

    // pilares: o lance abaixo do nível, no storey da base
    for (const p of pav.pilares) {
      const perfil = perfilPilar(p);
      const rpil = resultado?.pilares.find(
        (x) => x.pavimentoId === pav.id && x.repeticao === nivel.repeticao && x.pilar.id === p.id,
      );
      let armadura: PosicaoIfc[] = [];
      if (comArmadura && rpil) {
        if (perfil.tipo === "poligono") semArmaduraPoligonal.add(p.nome);
        armadura = paraIfc(
          armaduraPilar({
            barras: rpil.resultado.barras,
            estribo: rpil.resultado.estribo,
            perfil,
            altura: pav.peDireito,
            cobrimento: m.cobrimentoPilar,
            aco: m.aco,
            acoEstribo: m.acoEstribo,
          }),
        );
      }
      elementos.push({
        tipo: "pilar",
        chave: `${nivel.chave}|pilar|${p.id}`,
        nome: p.nome,
        nivel: base,
        x: p.x,
        y: p.y,
        rotacao: p.secao ? 0 : ((p.rotacao ?? 0) * Math.PI) / 180,
        base: 0,
        altura: pav.peDireito,
        perfil,
        propriedades: semNaN({
          Nome: p.nome,
          Pavimento: pav.nome,
          NivelBase: base.nome,
          NivelTopo: nivel.nome,
          Secao: rotuloSecaoPilar(p),
          ...(p.rotacao && !p.secao ? { Rotacao_graus: p.rotacao } : {}),
          PeDireito_m: pav.peDireito,
          ...(p.transicao ? { NasceEmVigaDeTransicao: true } : {}),
          ...comuns(m.cobrimentoPilar),
          ...(rpil ? propriedadesPilar(rpil) : {}),
        }),
        armadura,
      });
    }
  }

  // escada (vigas avulsas do SISTRUT): no nível de baixo dos que ela liga, inclinada de
  // um apoio ao outro (escada.ts); sem dedução, num nível "cota não definida" em 0. Os
  // pilares do pavimento avulso são só apoios de cálculo e não entram.
  const maisBaixo = new Map<string, NivelIfc>();
  for (const n of niveis)
    if (n.pavimento && !maisBaixo.has(n.pavimento.id)) maisBaixo.set(n.pavimento.id, n);
  const niveisPredio: NivelPredio[] = [...maisBaixo.values()].map((n) => ({
    pavimento: n.pavimento!,
    cota: n.elevacao,
  }));
  for (const pav of obra.pavimentos.filter(pavimentoDeVigasAvulsas)) {
    const deduzidos = deduzirApoiosEscada(pav, niveisPredio);
    let semCota: NivelIfc | undefined;
    for (const v of pav.vigas) {
      const chave = `${pav.id}|escada|${v.id}`;
      // apoios no mesmo ponto da planta não dão uma escada: sem posição deduzida
      const par = deduzidos.get(v.id);
      const deduzida =
        par !== undefined &&
        Math.hypot(par[1].ponto.x - par[0].ponto.x, par[1].ponto.y - par[0].ponto.y) > 1e-3;
      let e: VigaIfc | undefined;
      if (par && deduzida) {
        const [a0, a1] = par;
        const baixo = a0.nivel.cota <= a1.nivel.cota ? a0 : a1;
        const nivel = maisBaixo.get(baixo.nivel.pavimento.id)!;
        const ponto = (a: typeof a0): P3 => ({ ...a.ponto, z: a.nivel.cota - nivel.elevacao });
        e = vigaIfc(v, pav, nivel, {
          chave,
          inclinada: { de: ponto(a0), ate: ponto(a1) },
          propriedades: {
            PosicaoDeduzida: `reações lançadas em ${a0.viga} (${a0.nivel.pavimento.nome}) e ${a1.viga} (${a1.nivel.pavimento.nome})`,
            CotaIncerta: false,
          },
        });
      } else {
        if (!semCota) {
          semCota = {
            chave: `${pav.id}|sem-cota`,
            nome: `${pav.nome} (cota não definida)`,
            elevacao: 0,
            descricao:
              "Vigas avulsas importadas do SISTRUT (.VIG sem .LAJ, como uma escada) cuja posição as cargas do prédio não permitem deduzir; ficam na posição da importação, fora da planta",
            pavimento: pav,
            cotaIncerta: true,
          };
          niveis.splice(1, 0, semCota);
          avisos.push(
            `${pav.nome}: nenhuma carga das vigas do prédio casa com as reações das vigas avulsas; elas ficam no nível "${semCota.nome}", em 0, fora da planta.`,
          );
        }
        e = vigaIfc(v, pav, semCota, { chave, propriedades: { CotaIncerta: true } });
      }
      if (e) elementos.push(e);
    }
  }

  if (semArmaduraPoligonal.size > 0)
    avisos.push(
      `Pilares de seção poligonal (${[...semArmaduraPoligonal].join(", ")}) saem sem as barras.`,
    );
  const { Cobrimento_cm: _, ...daObra } = comuns(0);
  return {
    nome: obra.nome || "Obra",
    niveis,
    elementos,
    concreto,
    propriedades: { ...daObra, Pavimentos: { inteiro: obra.pavimentos.length } },
    avisos,
  };
}
