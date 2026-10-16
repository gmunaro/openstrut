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
import { numAte } from "../../calculo/texto";
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
import { importarV1 } from "../importarV1";
import { explicarErros } from "./mensagens";
import type { RegistroVigLido } from "./viga";

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
  /** "Vx apoia em Vy" do LAJEMONT, que o .LAJ não guarda: por nome da viga, as vigas em
   *  que ela se apoia nos cruzamentos sem pilar (`Viga.apoiaEm`). */
  apoiosEmViga?: Record<string, string[]>;
  /** Id e nome do pavimento (padrão "PAV1"). Com o campo, os ids de lajes, vigas e
   *  pilares levam o id do pavimento na frente ("COB/L1"), para a obra de vários
   *  pavimentos não repetir ids; o nome fica o do original. */
  pavimento?: { id: string; nome: string };
  /** Registros do .VIG do mesmo pavimento (`lerVig`): o "apoia em" de cada viga sai dos
   *  apoios dela, pelos vãos (`apoiosEmVigaDoVig`). `apoiosEmViga` vale por cima. */
  registrosVig?: readonly RegistroVigLido[];
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

/** Vínculos forçados da V2 em cada lado: só o livre (código 1). As continuidades vão
 *  em `Pavimento.continuidadesLajes` (ou ficam com a automática, que compara o grupo).
 *  Código > 2 em laje não maciça, que o original não produz (LAJECALC.BAS:3695, 3912):
 *  aviso. */
function livresDaLaje(l: LajeLaj, avisos: string[]): (Vinculo | null)[] {
  return l.codigos.map((codigo, k) => {
    if (codigo === 1) return "livre";
    if (l.tipo !== 0 && codigo > 2)
      avisos.push(`${l.nome} lado ${k + 1}: código ${codigo} em laje não maciça; ignorado.`);
    return null;
  });
}

/** i de cada lado engastado (`Laje.coeficientesLados`). Sem a otimização, o código
 *  gravado é o que o usuário deu no <A>ltera do LAJECALC 1, i = (código − 2)/10; com
 *  ela, o gravado é o reduzido por ela (e ela o refaz): vale o do engaste. */
function coeficientesDaLaje(l: LajeLaj, codigoEngaste: number, otimiza: boolean) {
  return l.codigos.map((c) =>
    !otimiza && l.tipo === 0 && c > 2 && c !== codigoEngaste ? (c - 2) / 10 : null,
  );
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

/** O "Vx apoia em Vy" do LAJEMONT a partir do .VIG: o LAJEMONT grava no .VIG os trechos
 *  de cada viga com os apoios que o usuário escolheu (LAJEMONT.BAS:5170-5393), e o vão
 *  de cada trecho é a distância entre dois nós do eixo. Andando pelos vãos desde o
 *  início do eixo (depois do balanço esquerdo), cada apoio cai num nó; um apoio num
 *  cruzamento sem pilar diz que a viga se apoia nas que cruzam ali. Viga cujos vãos não
 *  caem em nós do eixo (vão editado no VIGA) fica sem a escolha e com aviso. */
export function apoiosEmVigaDoVig(
  lida: Pick<ObraLaj, "eixos" | "pilares">,
  registros: readonly RegistroVigLido[],
  avisos: string[],
): Record<string, string[]> {
  const perto = (a: number, b: number) => Math.abs(a - b) < TOL_PILAR;
  const mesmo = (a: Ponto, b: Ponto) => perto(a.x, b.x) && perto(a.y, b.y);
  const r: Record<string, string[]> = {};
  for (const reg of registros) {
    const e = lida.eixos.find((x) => x.nome === reg.nome);
    if (!e || e.pontos.length < 2) continue;
    const horizontal = e.pontos.every((p) => p.y === e.pontos[0]!.y);
    const s = (p: Ponto) => (horizontal ? p.x : p.y);
    const nos = [...e.pontos].sort((a, b) => s(a) - s(b));
    const inicio = s(nos[0]!);
    const fim = s(nos.at(-1)!);
    const n = reg.tramos;
    const vao = (t: number) => sng(reg.trechos[t]?.vao ?? 0);
    // posições dos apoios 0..n ao longo do eixo
    const apoios = [inicio + (reg.balancoEsquerdo ? vao(0) : 0)];
    for (let t = 1; t <= n; t++) apoios.push(apoios.at(-1)! + vao(t));
    const ponta = apoios.at(-1)! + (reg.balancoDireito ? vao(n + 1) : 0);
    const noDe = apoios.map((a) => nos.find((p) => perto(s(p), a)));
    if (n < 1 || !perto(ponta, fim) || noDe.some((p) => !p)) {
      avisos.push(
        `Viga ${reg.nome}: os vãos do .VIG não caem nos nós do eixo do .LAJ; o "apoia em" dela fica com a regra da V2.`,
      );
      continue;
    }
    const emVigas = noDe.flatMap((p) => {
      if (lida.pilares.some((q) => mesmo(q, p!) || (q.fim !== undefined && mesmo(q.fim, p!))))
        return [];
      return lida.eixos
        .filter((o) => o !== e && o.pontos.some((q) => mesmo(q, p!)))
        .map((o) => o.nome);
    });
    if (emVigas.length > 0) r[reg.nome] = [...new Set(emVigas)];
  }
  return r;
}

/** Formato do .LAJ pela primeira linha: o de saída do LAJEGRAV ("SISTRUT Software e
 *  Tecnologia s/c Ltda", LAJEGRAV.BAS:484), o de entrada da V1 ("SISTRUT40","LAJ",1,…,
 *  gravado com WRITE #; DADOS.md da V1) ou nenhum dos dois. */
export function formatoLaj(texto: string): "saida" | "entrada" | undefined {
  const inicio = texto.trimStart();
  if (inicio.startsWith('"SISTRUT40"')) return "entrada";
  if (inicio.startsWith("SISTRUT")) return "saida";
  return undefined;
}

/** Lê o .LAJ e monta a obra da V2 (um pavimento). Aceita os dois formatos:
 *  - o de saída, que o LAJEGRAV grava: polígonos, códigos, montagem; obra no modo
 *    original, com as `opcoes`;
 *  - o de entrada, com cabeçalho entre aspas (lajes retangulares com bordos, cargas e
 *    vigas): lido por `importarV1`, que gera vigas e pilares a partir das lajes; as
 *    `opcoes` não se aplicam.
 *  Tudo o que não tem representação vira aviso; a obra sai validada pelo leitor do
 *  arquivo da V2. `nomeArquivo` só entra nas mensagens. */
export function importarLaj(
  texto: string,
  opcoes: OpcoesImportacaoLaj = {},
  nomeArquivo = "obra.LAJ",
): ImportacaoLaj {
  const formato = formatoLaj(texto);
  if (formato === "entrada") return importarLajDeEntrada(texto, opcoes, nomeArquivo);
  if (!formato)
    return {
      ok: false,
      erros: [
        `${nomeArquivo}: não é um .LAJ do SISTRUT (a primeira linha deveria ser o cabeçalho "SISTRUT Software e Tecnologia"). Confira se o arquivo é o .LAJ certo, ou importe sem ele.`,
      ],
    };
  let lida: ObraLaj;
  try {
    lida = lerObraLaj(texto);
  } catch (e) {
    return {
      ok: false,
      erros: [
        `${nomeArquivo}: .LAJ ilegível (${e instanceof Error ? e.message : String(e)}). Abra a obra no LAJE do SISTRUT e grave de novo, ou importe sem este arquivo.`,
      ],
    };
  }
  const avisos: string[] = [...lida.avisos];
  // pavimento sem laje: todos os painéis marcados como buraco no LAJEGEOM (o térreo sobre
  // o solo, só com vigas baldrame e alvenarias); o LAJEMONT monta as vigas assim mesmo
  if (lida.painel.lajes.length === 0) {
    if (lida.eixos.length === 0)
      return {
        ok: false,
        erros: [
          `${nomeArquivo}: não tem lajes nem vigas. Abra o pavimento no LAJEGEOM do SISTRUT e confira se ele foi gravado, ou importe sem este arquivo.`,
        ],
      };
    avisos.push(
      lida.buracos > 0
        ? `Nenhuma laje: os ${lida.buracos} painéis estão marcados como buraco no LAJEGEOM. O pavimento fica só com as vigas, os pilares e as alvenarias.`
        : "Nenhuma laje: o pavimento fica só com as vigas, os pilares e as alvenarias.",
    );
  } else if (lida.buracos > 0)
    avisos.push(
      `${lida.buracos} painel(éis) marcado(s) como buraco no LAJEGEOM: não entram como laje.`,
    );
  // "apoia em": o do .VIG do pavimento, com o das opções por cima
  const apoiosEmViga = {
    ...(opcoes.registrosVig ? apoiosEmVigaDoVig(lida, opcoes.registrosVig, avisos) : {}),
    ...opcoes.apoiosEmViga,
  };
  const idDe = (nome: string) => (opcoes.pavimento ? `${opcoes.pavimento.id}/${nome}` : nome);
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
    const vinculosLados = livresDaLaje(l, avisos);
    const coeficientesLados = coeficientesDaLaje(l, codigoContinuidade, otimiza);
    // ângulo: o da armadura (maciça; tipo 3 com <D>), o das nervuras (pré-moldada); o −1
    // que o LAJECALC 2 grava sem direção não entra (LAJECALC.BAS:4548)
    const angulo = l.angulo;
    // μ = 1 gravado: numa maciça cujas cordas dão outro μ, ou num tipo 3, foi digitado
    // (<R>): μ informado (`muInformado`), senão a V2 o leria como não informado
    const pelasCordas = () =>
      direcaoMu(
        l.vertices.map((v) => ({ x: sng(v.x), y: sng(v.y) })),
        sng(l.angulo),
        lap,
        "original",
      ).mu;
    const muInformado = l.mu === 1 && (l.tipo === 3 || (l.tipo === 0 && pelasCordas() !== 1));
    const negativasImpostas = l.codigos.map((_, k) => negativas.get(`${l.nome}|${k}`) ?? null);
    const pos = l.armaduraImposta;
    const principal =
      pos?.principal !== undefined ? barraDoLajeproc(pos.principal, lap) : undefined;
    const secundaria =
      pos?.secundaria !== undefined ? barraDoLajeproc(pos.secundaria, lap) : undefined;
    if (pos && !principal && !secundaria)
      avisos.push(`${l.nome}: positivas impostas fora das tabelas do .LAP; ignoradas.`);
    return {
      id: idDe(l.nome),
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
      ...(coeficientesLados.some((c) => c !== null) ? { coeficientesLados } : {}),
      ...(muInformado ? { muInformado } : {}),
      ...(l.grupo !== 0 ? { grupo: l.grupo } : {}),
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
    const apoiaEm = apoiosEmViga[e.nome]?.map(idDe);
    vigas.push({
      id: idDe(e.nome),
      nome: e.nome,
      x1: Math.min(a.x, b.x),
      y1: Math.min(a.y, b.y),
      x2: Math.max(a.x, b.x),
      y2: Math.max(a.y, b.y),
      bw: extra.bw ?? secao.bw,
      h: extra.h ?? secao.h,
      cargaLinear: 0,
      ...(extra.pesoProprio !== undefined ? { pesoProprio: extra.pesoProprio } : {}),
      ...(apoiaEm ? { apoiaEm } : {}),
    });
  }

  // pilares: o pontual no ponto; o pilar-parede no centro do trecho, com o comprimento
  // dele na seção, e o trecho para a montagem
  const sp = opcoes.secaoPilares ?? { b: 20, h: 20 };
  const trechosPilares: TrechoPilar[] = [];
  const pilares: Pilar[] = lida.pilares.map((p) => {
    if (!p.fim) return { id: idDe(p.nome), nome: p.nome, x: p.x, y: p.y, b: sp.b, h: sp.h };
    const { x: x2, y: y2 } = p.fim;
    trechosPilares.push({ pilar: idDe(p.nome), inicio: { x: p.x, y: p.y }, fim: { x: x2, y: y2 } });
    const horizontal = p.y === y2;
    if (!horizontal && p.x !== x2)
      avisos.push(`Pilar-parede ${p.nome} inclinado: seção da V2 ${sp.b} × ${sp.h} cm no centro.`);
    const comprimento = Math.round(Math.hypot(x2 - p.x, y2 - p.y) * 10000) / 100;
    return {
      id: idDe(p.nome),
      nome: p.nome,
      x: (p.x + x2) / 2,
      y: (p.y + y2) / 2,
      b: horizontal ? comprimento : sp.b,
      h: horizontal ? sp.h : p.x === x2 ? comprimento : sp.h,
    };
  });

  // "Vx apoia em Vy" (LAJEMONT): a escolha não fica no .LAJ (vai ao .VIG, que o VIGA
  // regrava com a reação resolvida); vem de `opcoes.apoiosEmViga` ou vale a regra da V2
  const escolhido = (vs: readonly string[]) =>
    vs.some((v) => vs.some((w) => apoiosEmViga[v]?.includes(w)));
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
    if (vs.length > 1 && !comPilar && !escolhido(vs))
      avisos.push(
        `Cruzamento sem pilar em (${numAte(x!, 3)}; ${numAte(y!, 3)}) entre ${vs.join(" e ")}: a escolha "apoia em" do LAJEMONT não fica no .LAJ; vale a regra da V2 (a viga que termina se apoia na que passa). Confira na planta qual viga apoia em qual.`,
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
        id: opcoes.pavimento?.id ?? "PAV1",
        nome: opcoes.pavimento?.nome ?? "PAV1",
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
        // as continuidades confirmadas no LAJECALC 1 (A_11e0), como o original as gravou
        ...(lida.painel.continuidadesConfirmadas
          ? {
              continuidadesLajes: lida.painel.continuidades.map((c) => ({
                lajeA: idDe(c.lajeA),
                ladoA: c.bordoA,
                ...(c.lajeB !== null ? { lajeB: idDe(c.lajeB), ladoB: c.bordoB } : {}),
              })),
            }
          : {}),
      },
    ],
  };
  // a obra passa pela mesma validação de um arquivo aberto
  const lido = lerObra(serializarObra(obra));
  return lido.ok
    ? { ok: true, obra: lido.obra, avisos }
    : { ok: false, erros: explicarErros(lido.erros, obra, () => ({ laj: nomeArquivo })) };
}

/** .LAJ no formato de entrada (cabeçalho "SISTRUT40"): a obra da V1, pelo importador
 *  dela. As opções do .LAJ de saída (materiais, seções, "apoia em") não valem aqui. */
function importarLajDeEntrada(
  texto: string,
  opcoes: OpcoesImportacaoLaj,
  nomeArquivo: string,
): ImportacaoLaj {
  const nome = /\.laj$/i.test(nomeArquivo) ? nomeArquivo : `${nomeArquivo}.LAJ`;
  const r = importarV1([{ nome, texto }]);
  if (!r.ok) return r;
  const avisos = [
    `${nome} está no formato de entrada (cabeçalho "SISTRUT40"): lajes retangulares com bordos e cargas, sem a geometria da montagem. Vigas e pilares foram gerados a partir das lajes; confira a planta.`,
    ...(Object.keys(opcoes).length > 0
      ? ["As opções de importação do .LAJ gravado pelo LAJEGRAV não valem neste formato."]
      : []),
    ...r.avisos,
  ];
  return { ok: true, obra: r.obra, avisos };
}
