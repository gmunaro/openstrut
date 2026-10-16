// Importação de obra do SISTRUT 4.0 original, parte de lajes: o .LAJ (texto com
// cabeçalho, gravado pelo LAJEGRAV depois do LAJEGEOM, do LAJECALC e do LAJEMONT)
// vira uma Obra da V2 no modo "Como o SISTRUT original". Leitura: `lerObraLaj`
// (calculo/sistrut/montagem/obraLaj.ts, formato em LAJEGRAV.BAS:484-626).
//
// O que entra: lajes (polígono na ordem do original, tipo, carga permanente, ângulo e
// μ do POLÍGONO, inclinação das nervuras da pré-moldada, H, positivas impostas no
// LAJEPROC), negativas impostas nas continuidades, cargas de ocupação por área,
// alvenarias, vigas (eixos) e pilares (posições e trechos dos pilares-parede). Os
// vínculos são refeitos para a V2 rodar o LAJECALC de novo: lado com código 1 = livre;
// continuidade entre duas lajes que a automática acha = sem vínculo forçado (a
// automática e a otimização refazem os códigos; os gravados são os finais); trecho
// engastado sem vizinha = engastado; lado que a V2 ligaria e o original não (sem
// continuidade confirmada, ou de grupos diferentes) = apoiado.
//
// O que o .LAJ não tem vem das opções: materiais (LAJE.INI/.LAP), parâmetros do .LAP
// editados, se a otimização dos negativos rodou, seções das vigas e dos pilares, peso
// próprio das vigas (digitado no LAJEMONT) e pé-direito. O que a obra da V2 não
// representa vira aviso.
//
// Unidades: o .LAJ grava planta em m e cargas em t/m² e t/m; a V2 guarda kN/m² e
// kN/m (1 tf = 9,80665 kN, `tfParaKn`).
import { qbCint, sng } from "../../calculo/sistrut/base/f32";
import { emSingle, PARAMETROS_LAJE } from "../../calculo/sistrut/base/parametros";
import { direcaoMu } from "../../calculo/sistrut/lajes/momentos";
import { lerObraLaj, type ObraLaj } from "../../calculo/sistrut/montagem/obraLaj";
import { tfParaKn } from "../../calculo/unidades";
import type {
  BarraImposta,
  Laje,
  Materiais,
  Obra,
  ParametrosLajeObra,
  Pilar,
  Ponto,
  TipoLaje,
  TrechoPilar,
  Viga,
  Vinculo,
} from "../../dominio/obra";
import { lerObra, serializarObra, VERSAO_ATUAL } from "../arquivo";

export interface OpcoesImportacaoLaj {
  /** Materiais (o .LAJ não os tem). Padrão: os de fábrica do SISTRUT, fck 15 MPa
   *  (0,15 t/cm²), CA-50 classe B, cobrimentos 1,5/2/2 cm. */
  materiais?: Partial<Materiais>;
  /** Parâmetros do .LAP que o usuário editou (ex.: piso Mneg/Mpos 0,35). */
  parametrosLaje?: ParametrosLajeObra;
  /** Se a otimização dos negativos (LAJECALC 6) rodou. Ausente = rodou. */
  otimizaNegativos?: boolean;
  /** Seção das vigas, cm. Padrão 12 × 50: 0,15 t/m = 150 kg/m no original. */
  secaoVigas?: { bw: number; h: number };
  /** Por nome da viga: seção (cm) e peso próprio digitado no LAJEMONT (kN/m). */
  vigas?: Record<string, Partial<Pick<Viga, "bw" | "h" | "pesoProprio">>>;
  /** Seção dos pilares, cm (no pilar-parede, a espessura). Padrão 20 × 20. */
  secaoPilares?: { b: number; h: number };
  /** Pé-direito do pavimento, m. Padrão 3. */
  peDireito?: number;
}

export type ImportacaoLaj =
  | { ok: true; obra: Obra; avisos: string[] }
  | { ok: false; erros: string[] };

const MATERIAIS_SISTRUT: Materiais = {
  fck: 15,
  aco: "CA-50",
  acoEstribo: "CA-50",
  classeAco: "B",
  caa: 1,
  cobrimentoLaje: 1.5,
  cobrimentoViga: 2,
  cobrimentoPilar: 2,
};

const TIPOS: Record<number, TipoLaje> = { 0: "macica", 1: "pre-moldada", 3: "comum-nao-calculada" };

const H_PADRAO = 10;

/** Tolerância de posição dos pilares nos eixos, m (a do leitor). */
const TOL_PILAR = 0.005;

type LajeLaj = ObraLaj["painel"]["lajes"][number];
type Tabelas = { bitolas: readonly { bitola: number }[]; espacamentos: readonly number[] };

const mesmoPonto = (a: Ponto, b: Ponto) => a.x === b.x && a.y === b.y;

/** Lado k da laje: do vértice k ao k+1. */
const lado = (l: LajeLaj, k: number): [Ponto, Ponto] => [
  l.vertices[k]!,
  l.vertices[(k + 1) % l.vertices.length]!,
];

/** Lado de outra laje maciça com os mesmos dois vértices do lado k de `l`, nenhum dos
 *  dois livre: o que a continuidade automática da V2 liga (LAJECALC.BAS:3690-3731, sem
 *  o grupo, que a obra da V2 não tem). */
function ladoComum(l: LajeLaj, k: number, lajes: readonly LajeLaj[]) {
  if (l.tipo !== 0 || l.codigos[k] === 1) return undefined;
  const [a, b] = lado(l, k);
  for (const o of lajes) {
    if (o === l || o.tipo !== 0) continue;
    for (let h = 0; h < o.vertices.length; h++) {
      const [c, d] = lado(o, h);
      if (o.codigos[h] === 1) continue;
      if ((mesmoPonto(a, d) && mesmoPonto(b, c)) || (mesmoPonto(a, c) && mesmoPonto(b, d)))
        return { laje: o, lado: h };
    }
  }
  return undefined;
}

/** Vínculo forçado da V2 em cada lado da laje (null = pela vizinhança). */
function vinculosDosLados(
  l: LajeLaj,
  obra: ObraLaj,
  codigoContinuidade: number,
  otimiza: boolean,
  avisos: string[],
): (Vinculo | null)[] {
  const { lajes, continuidades, continuidadesConfirmadas } = obra.painel;
  const continuidadeDe = (nome: string, k: number) =>
    continuidades.find(
      (c) => (c.lajeA === nome && c.bordoA === k) || (c.lajeB === nome && c.bordoB === k),
    );
  return l.codigos.map((codigo, k) => {
    if (codigo === 1) return "livre";
    if (l.tipo !== 0) {
      // o original não liga continuidade a laje não maciça (LAJECALC.BAS:3695, 3912)
      if (codigo > 2)
        avisos.push(`${l.nome} lado ${k + 1}: código ${codigo} em laje não maciça; ignorado.`);
      return null;
    }
    const comum = ladoComum(l, k, lajes);
    // a automática do original só liga lajes do mesmo grupo (LAJECALC.BAS:3709)
    const doOriginal = comum !== undefined && comum.laje.grupo === l.grupo;
    if (!continuidadesConfirmadas) return comum && !doOriginal ? "apoiado" : null;
    const cont = continuidadeDe(l.nome, k);
    if (cont?.lajeB === null) {
      if (comum && continuidadeDe(comum.laje.nome, comum.lado)?.lajeB === null)
        avisos.push(
          `${l.nome} lado ${k + 1} e ${comum.laje.nome} lado ${comum.lado + 1}: os dois engastados sem vizinha num lado comum; na V2 viram uma continuidade.`,
        );
      return "engastado";
    }
    if (cont) {
      const outra = cont.lajeA === l.nome ? cont.lajeB : cont.lajeA;
      if (!comum || comum.laje.nome !== outra)
        avisos.push(
          `${l.nome} lado ${k + 1}: continuidade com ${outra} que a continuidade automática não acha (lados diferentes); não representada.`,
        );
      else if (!otimiza && codigo !== codigoContinuidade)
        avisos.push(
          `${l.nome} lado ${k + 1}: código ${codigo} (i = ${(codigo - 2) / 10}) sem a otimização; a V2 só representa o i da continuidade automática (código ${codigoContinuidade}).`,
        );
      return null;
    }
    if (comum) return "apoiado";
    return codigo > 2 ? "engastado" : null;
  });
}

/** Barra de um código do LAJEPROC, −(1000·índice da bitola + índice 1-based do
 *  espaçamento) (LAJEPROC.BAS:451, 468). */
function barraDoLajeproc(codigo: number, t: Tabelas): BarraImposta | undefined {
  const c = Math.abs(codigo);
  const bitola = t.bitolas[Math.floor(c / 1000)]?.bitola;
  const espacamento = t.espacamentos[(c % 1000) - 1];
  return bitola !== undefined && espacamento !== undefined ? { bitola, espacamento } : undefined;
}

/** Negativa imposta no LAJECALC, CINT(1000·índice da bitola + espaçamento em cm)
 *  (LAJECALC.BAS:4166). */
function negativaImposta(codigo: number, t: Tabelas): BarraImposta | undefined {
  const bitola = t.bitolas[Math.floor(codigo / 1000)]?.bitola;
  const espacamento = codigo % 1000;
  return bitola !== undefined && espacamento > 0 ? { bitola, espacamento } : undefined;
}

/** Retângulo envolvente do polígono (o que a tela e a NBR 6118 usam). */
function envolvente(p: readonly Ponto[]) {
  const xs = p.map((v) => v.x);
  const ys = p.map((v) => v.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, lx: Math.max(...xs) - x, ly: Math.max(...ys) - y };
}

/** Lê o .LAJ do original e monta a obra da V2 (um pavimento). Tudo o que não tem
 *  representação vira aviso; a obra sai validada pelo leitor do arquivo da V2. */
export function importarLaj(texto: string, opcoes: OpcoesImportacaoLaj = {}): ImportacaoLaj {
  if (!texto.trimStart().startsWith("SISTRUT"))
    return { ok: false, erros: ["O arquivo não é um .LAJ do SISTRUT (falta o cabeçalho)."] };
  let lida: ObraLaj;
  try {
    lida = lerObraLaj(texto);
  } catch (e) {
    return { ok: false, erros: [`.LAJ ilegível: ${e instanceof Error ? e.message : String(e)}`] };
  }
  if (lida.painel.lajes.length === 0) return { ok: false, erros: ["O .LAJ não tem lajes."] };
  const avisos: string[] = [...lida.avisos];
  const t = tfParaKn;
  const lap = emSingle({ ...PARAMETROS_LAJE, ...opcoes.parametrosLaje });
  const codigoContinuidade = qbCint(sng(lap.relacaoNegPosMax) * 10 + 2);
  const otimiza = opcoes.otimizaNegativos ?? true;

  // negativas impostas no LAJECALC, no lado A de cada continuidade; o código negativo é
  // a escolha que o LAJEPROC regrava a cada rodada (LAJEPROC.BAS:892), não entrada
  const negativas = new Map<string, BarraImposta>();
  for (const c of lida.painel.continuidades) {
    if (c.armaduraImposta === undefined || c.armaduraImposta < 0) continue;
    const n = negativaImposta(c.armaduraImposta, lap);
    if (n) negativas.set(`${c.lajeA}|${c.bordoA}`, n);
    else
      avisos.push(
        `${c.lajeA} lado ${c.bordoA + 1}: negativa imposta ${c.armaduraImposta} fora das tabelas do .LAP; ignorada.`,
      );
  }

  const lajes: Laje[] = lida.painel.lajes.map((l) => {
    const tipo = TIPOS[l.tipo] ?? "macica";
    let h = l.h ?? lida.hMinimos[l.nome];
    if (h === undefined) {
      h = H_PADRAO;
      if (l.tipo !== 1)
        avisos.push(`${l.nome}: sem H gravado nem espessura mínima; H = ${H_PADRAO} cm.`);
    }
    const poligono = l.vertices.map((v) => ({ x: v.x, y: v.y }));
    const vinculosLados = vinculosDosLados(l, lida, codigoContinuidade, otimiza, avisos);
    // ângulo: o da armadura (maciça; tipo 3 com <D>), o das nervuras (pré-moldada); o −1
    // que o LAJECALC 2 grava sem direção não entra (LAJECALC.BAS:4548)
    const angulo = l.angulo;
    // μ = 1 gravado: numa maciça cujas cordas dão outro μ, ou num tipo 3, foi digitado
    // (<R>), e a V2 o leria como não informado
    if (l.tipo === 3 && l.mu === 1)
      avisos.push(`${l.nome}: μ = 1 informado; a V2 o lê como não informado (μ 0 do original).`);
    if (l.tipo === 0 && l.mu === 1) {
      const vs = l.vertices.map((v) => ({ x: sng(v.x), y: sng(v.y) }));
      const pelasCordas = direcaoMu(vs, sng(l.angulo), lap, "original").mu;
      if (pelasCordas !== 1)
        avisos.push(
          `${l.nome}: μ = 1 informado (as cordas dão ${Number(pelasCordas.toFixed(2))}); a V2 calcula μ = 1 pelas cordas e não o representa.`,
        );
    }
    const negativasImpostas = l.codigos.map((_, k) => negativas.get(`${l.nome}|${k}`) ?? null);
    const pos = l.armaduraImposta;
    const principal =
      pos?.principal !== undefined ? barraDoLajeproc(pos.principal, lap) : undefined;
    const secundaria =
      pos?.secundaria !== undefined ? barraDoLajeproc(pos.secundaria, lap) : undefined;
    if (pos && !principal && !secundaria)
      avisos.push(`${l.nome}: positivas impostas fora das tabelas do .LAP; ignoradas.`);
    return {
      id: l.nome,
      nome: l.nome,
      ...envolvente(poligono),
      h,
      revestimento: t(l.cargaPermanente),
      sobrecarga: 0,
      vinculos: {},
      // μ ≤ 0 = não informado: 1 na V2 (pelas cordas na maciça); na pré-moldada não entra
      mu: l.tipo !== 1 && l.mu > 0 ? l.mu : 1,
      poligono,
      ...(vinculosLados.some((v) => v !== null) ? { vinculosLados } : {}),
      // a maciça e a pré-moldada sem ângulo valem 0; o tipo 3 sem <D>, −1
      ...(angulo > 0 || (l.tipo === 3 && angulo === 0) ? { anguloArmadura: angulo } : {}),
      ...(tipo !== "macica" ? { tipo } : {}),
      ...(principal || secundaria
        ? {
            armaduraImposta: {
              ...(principal ? { principal } : {}),
              ...(secundaria ? { secundaria } : {}),
            },
          }
        : {}),
      ...(negativasImpostas.some((n) => n !== null) ? { negativasImpostas } : {}),
    };
  });

  const secao = opcoes.secaoVigas ?? { bw: 12, h: 50 };
  const vigas: Viga[] = [];
  for (const e of lida.eixos) {
    const [a, b] = [e.pontos[0], e.pontos.at(-1)];
    const reta =
      a &&
      b &&
      !mesmoPonto(a, b) &&
      (e.pontos.every((p) => p.x === a.x) || e.pontos.every((p) => p.y === a.y));
    if (!reta) {
      avisos.push(`Viga ${e.nome}: eixo que não é reto horizontal ou vertical; não importada.`);
      continue;
    }
    if (e.pontos.some((p, k) => k > 0 && p.x - e.pontos[k - 1]!.x + (p.y - e.pontos[k - 1]!.y) < 0))
      avisos.push(
        `Viga ${e.nome}: eixo em ordem decrescente no .LAJ; a V2 o percorre em ordem crescente.`,
      );
    const extra = opcoes.vigas?.[e.nome] ?? {};
    vigas.push({
      id: e.nome,
      nome: e.nome,
      x1: Math.min(a.x, b.x),
      y1: Math.min(a.y, b.y),
      x2: Math.max(a.x, b.x),
      y2: Math.max(a.y, b.y),
      bw: extra.bw ?? secao.bw,
      h: extra.h ?? secao.h,
      cargaLinear: 0,
      ...(extra.pesoProprio !== undefined ? { pesoProprio: extra.pesoProprio } : {}),
    });
  }

  // pilares: o pontual no ponto; o pilar-parede no centro do trecho, com o comprimento
  // dele na seção, e o trecho para a montagem
  const sp = opcoes.secaoPilares ?? { b: 20, h: 20 };
  const trechosPilares: TrechoPilar[] = [];
  const pilares: Pilar[] = lida.pilares.map((p) => {
    if (!p.fim) return { id: p.nome, nome: p.nome, x: p.x, y: p.y, b: sp.b, h: sp.h };
    const { x: x2, y: y2 } = p.fim;
    trechosPilares.push({ pilar: p.nome, inicio: { x: p.x, y: p.y }, fim: { x: x2, y: y2 } });
    const horizontal = p.y === y2;
    if (!horizontal && p.x !== x2)
      avisos.push(`Pilar-parede ${p.nome} inclinado: seção da V2 ${sp.b} × ${sp.h} cm no centro.`);
    avisos.push(
      `Pilar-parede ${p.nome}: o trecho vale na montagem; os apoios das vigas sobre ele seguem a regra da V2 (pilar no centro).`,
    );
    const comprimento = Math.round(Math.hypot(x2 - p.x, y2 - p.y) * 10000) / 100;
    return {
      id: p.nome,
      nome: p.nome,
      x: (p.x + x2) / 2,
      y: (p.y + y2) / 2,
      b: horizontal ? comprimento : sp.b,
      h: horizontal ? sp.h : p.x === x2 ? comprimento : sp.h,
    };
  });

  // "Vx apoia em Vy" (LAJEMONT): a escolha não fica no .LAJ; a V2 decide pela regra dela
  const nos = new Map<string, string[]>();
  for (const e of lida.eixos)
    for (const p of e.pontos) {
      const k = `${p.x};${p.y}`;
      nos.set(k, [...(nos.get(k) ?? []), e.nome]);
    }
  for (const [k, vs] of nos) {
    const [x, y] = k.split(";").map(Number);
    const comPilar = lida.pilares.some(
      (p) => Math.abs(p.x - x!) < TOL_PILAR && Math.abs(p.y - y!) < TOL_PILAR,
    );
    if (vs.length > 1 && !comPilar)
      avisos.push(
        `Cruzamento sem pilar em (${x}; ${y}) entre ${vs.join(" e ")}: a escolha "apoia em" do LAJEMONT não fica no .LAJ; vale a regra da V2.`,
      );
  }

  const obra: Obra = {
    versao: VERSAO_ATUAL,
    nome: lida.nome || "SISTRUT",
    norma: "nb1-78",
    modoCalculo: "original",
    ...(opcoes.otimizaNegativos !== undefined ? { otimizaNegativos: opcoes.otimizaNegativos } : {}),
    ...(opcoes.parametrosLaje ? { parametrosLaje: opcoes.parametrosLaje } : {}),
    materiais: { ...MATERIAIS_SISTRUT, ...opcoes.materiais },
    pavimentos: [
      {
        id: "PAV1",
        nome: "PAV1",
        peDireito: opcoes.peDireito ?? 3,
        repeticoes: 1,
        lajes,
        vigas,
        pilares,
        pilaresRemovidos: [],
        cargasOcupacao: lida.painel.cargasPorArea.map((a) => ({
          poligono: a.vertices.map((v) => ({ x: v.x, y: v.y })),
          total: t(a.total),
          acidental: t(a.acidental),
        })),
        alvenarias: lida.painel.alvenarias.map((a) => ({
          inicio: { ...a.inicio },
          fim: { ...a.fim },
          carga: t(a.carga),
        })),
        ...(trechosPilares.length > 0 ? { trechosPilares } : {}),
      },
    ],
  };
  // a obra passa pela mesma validação de um arquivo aberto
  const lido = lerObra(serializarObra(obra));
  return lido.ok ? { ok: true, obra: lido.obra, avisos } : { ok: false, erros: lido.erros };
}
