// Importação de uma obra a partir dos arquivos do SISTRUT escolhidos de uma vez (vários
// arquivos ou a pasta inteira). Cada arquivo é classificado pela extensão e casado pelo
// nome-base: cada .LAJ é um pavimento, e o .VIG/.SEC/.FOR/.TAB de mesmo nome são as vigas
// dele. A obra sai na ordem .LAJ → vigas → pilares, e cada importador (laje.ts, viga.ts,
// pilar.ts) recebe o que o anterior montou. Sem .LAJ, a obra sai do .VIG (só vigas) ou do
// .COL (só pilares), como o VIGA e o PILEDI do original as tratam.
//
// Vários pavimentos: o original guarda cada pavimento numa obra do LAJE/VIGA com o
// nome dele (COB.LAJ, SUP.LAJ...), e o .COL do PILGEEDI tem os níveis do prédio com nome
// e cota. O .REP de cada pavimento entra no nível que o usuário escolhe "pelo número ou
// pelo nome" (PILGEEDI.BAS:482-503), e o .COL guarda o nome de cada nível: o pavimento
// é o nível do .COL com o nome do .LAJ, e a ordem e o pé-direito saem das cotas.
//
// Robustez: a importação nunca lança. O que um arquivo não deixa ler vira aviso com o
// nome dele, e o resto entra; só não há obra quando nada de entrada (.LAJ, .VIG, .COL)
// pôde ser lido. Textos são lidos como o QuickBASIC os lê: windows-1252, ^Z (0x1A) é o
// fim do arquivo e CR sozinho é fim de linha. Os binários (.VIG, .SEC, .FOR, .TAB, .DSP,
// .INI) vão como bytes.
import { lerObra, serializarObra } from "../armazenamento/arquivo";
import { importarV1 } from "../armazenamento/importarV1";
import { importarLaj } from "../armazenamento/sistrut/laje";
import { explicarErros, type OrigemPavimento } from "../armazenamento/sistrut/mensagens";
import {
  importarPilaresSistrut,
  lerCol,
  type ArquivoCol,
  type NivelCol,
  type RepPilarSistrut,
} from "../armazenamento/sistrut/pilar";
import { importarVigasSistrut, lerVig } from "../armazenamento/sistrut/viga";
import type { Obra, Pavimento } from "../dominio/obra";

export interface ArquivoEntrada {
  nome: string;
  dados: Uint8Array;
}

/** O que a importação reconheceu, para a tela mostrar antes de abrir a obra. */
export interface ResumoImportacao {
  /** Do topo para a base, como na obra. */
  pavimentos: {
    nome: string;
    peDireito: number;
    lajes: number;
    vigas: number;
    pilares: number;
  }[];
  /** Arquivos lidos, em ordem de nome. */
  lidos: string[];
  /** Arquivos que ficaram de fora, com o motivo. */
  ignorados: { arquivo: string; motivo: string }[];
}

export type ResultadoImportacaoSistrut =
  | { ok: true; obra: Obra; avisos: string[]; resumo: ResumoImportacao }
  | { ok: false; erros: string[]; resumo: ResumoImportacao };

const TEXTO = new Set(["LAJ", "COL", "PIP", "PIL", "REP", "RLP"]);
const VIGAS = new Set(["VIG", "SEC", "FOR", "TAB", "DSP", "INI"]);
/** Da obra inteira, não de um pavimento: entram em todas as chamadas do importador de vigas. */
const VIGAS_DA_OBRA = new Set(["DSP", "INI"]);
/** Arquivos que o SISTRUT grava e que a importação não lê, com o motivo (o inventário de
 *  extensões está em docs/MODO-CALCULO.md, "Arquivos do original"). */
export const NAO_LIDOS: Record<string, string> = {
  BAK: "cópia de segurança do .LAJ ou do .COL anterior, que o LAJEGRAV e o PIGRAEDI guardam ao gravar (LAJEGRAV.BAS:484, PIGRAEDI.BAS:467); não usada.",
  FOK: "cópia de segurança do .FOR anterior, que o FORMEDCA guarda ao gravar (FORMEDCA.BAS:2974); não usada.",
  EDV: "desenho de armadura editado de uma viga, do DESEDCAO; não importado.",
  FRM: "fôrma do pavimento montada no FORMEDCA (FORMEDCA.BAS:2722), para o desenho de fôrmas, que a V2 não faz; não importada.",
  CFO: "fôrma dos pilares do FORMEDCA, para o desenho de fôrmas, que a V2 não faz; não importada.",
  LAP: "parametrização das lajes, que a importação ainda não lê; valem os parâmetros de fábrica (SISTRUT.LAP).",
  FOP: "parametrização do desenho de fôrmas (FORMPLOT), que a V2 não faz; não usada.",
  DXF: "desenho gerado pelo DESIMP, VPLOTA ou FORMPLOT: resultado, não entrada.",
  PLT: "arquivo de plotagem do VPLOTA ou do FORMPLOT: resultado, não entrada.",
  PUB: "desenho gerado pelo DESIMP: resultado, não entrada.",
  AVF: "arranjo das folhas de plotagem do VPLOTA: resultado, não entrada.",
  OBR: "arquivo da OpenStrut V1 (lista de obras), não do SISTRUT original; não usado.",
  VET: "desenho da OpenStrut V1, não do SISTRUT original: resultado, não entrada.",
  EIX: "eixos de auxílio do desenho da OpenStrut V1, não do SISTRUT original; não usados no cálculo.",
};
/** Leitor de uma extensão que completa a obra já montada (lajes, vigas, pilares), como o
 *  .EDV para o detalhamento das vigas. Recebe a obra e todos os arquivos da extensão
 *  (com o texto lido como o QuickBASIC lê) e devolve a obra completa. Uma exceção vira
 *  aviso e os arquivos ficam de fora; `ignorados` são os que ele não usou, com o motivo.
 *  Com um leitor registrado, a extensão sai de `NAO_LIDOS`. */
export interface LeitorExtra {
  extensao: string;
  completa(
    obra: Obra,
    arquivos: readonly (ArquivoEntrada & { texto: string })[],
  ): { obra: Obra; avisos: string[]; ignorados?: { arquivo: string; motivo: string }[] };
}
/** Os leitores extras, na ordem em que rodam. */
export const LEITORES_EXTRA: LeitorExtra[] = [];

/** .INI de configuração que não mudam o cálculo, por nome. O VIGA.INI e o DESENHO.INI
 *  entram nas vigas. */
const INI_NAO_LIDOS: Record<string, string> = {
  SISTRUT: "configuração do menu do SISTRUT (unidades de disco, impressora); não muda o cálculo.",
  VPLOTA: "configuração da plotagem do VPLOTA; não muda o cálculo.",
  PLOTER: "configuração da plotter; não muda o cálculo.",
  FORMA: "configuração do desenho de fôrmas, que a V2 não faz; não usada.",
  ARMADURA: "configuração do programa ARMADURA, que a V2 não tem; não usada.",
};
/** Cabeçalho do formato de entrada da OpenStrut V1 (texto gravado com WRITE #). */
const CABECALHO_V1 = '"SISTRUT40"';
const DECODIFICADOR = new TextDecoder("windows-1252");

/** Extensão em maiúsculas, sem o ponto; "" quando o nome não tem extensão. */
function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0
    ? ""
    : nome
        .slice(i + 1)
        .trim()
        .toUpperCase();
}

/** Nome sem extensão nem pasta, em maiúsculas: casa o .VIG e o .REP com o .LAJ. */
function baseDe(nome: string): string {
  const semPasta = nome.replace(/^.*[\\/]/, "");
  const i = semPasta.lastIndexOf(".");
  return (i < 0 ? semPasta : semPasta.slice(0, i)).trim().toUpperCase();
}

/** Ordem por nome, para a saída não depender da ordem em que o usuário selecionou. */
function porNome(a: ArquivoEntrada, b: ArquivoEntrada): number {
  const [x, y] = [a.nome.toUpperCase(), b.nome.toUpperCase()];
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Texto do arquivo como o INPUT # do QuickBASIC o lê: windows-1252, até o ^Z (fim de
 *  arquivo do DOS), com CR sozinho como fim de linha. */
function textoDe(arq: ArquivoEntrada): string {
  const fim = arq.dados.indexOf(0x1a);
  const dados = fim < 0 ? arq.dados : arq.dados.subarray(0, fim);
  return DECODIFICADOR.decode(dados).replace(/\r(?!\n)/g, "\n");
}

/** Arquivo no formato de entrada da OpenStrut V1 ("SISTRUT40","LAJ",1,...). */
const ehV1 = (arq: ArquivoEntrada) => textoDe(arq).trimStart().startsWith(CABECALHO_V1);

/** A mensagem sem o nome do arquivo na frente ("COB.LAJ: ..." ou "COB.LAJ, laje L1: ..."). */
function semArquivo(nome: string, msg: string): string {
  const m = msg.toUpperCase();
  const n = nome.toUpperCase();
  return m.startsWith(`${n}: `) || m.startsWith(`${n}, `) ? msg.slice(nome.length + 2) : msg;
}

/** Põe o nome do arquivo na frente da mensagem, se ela ainda não começa por ele. */
const comArquivo = (nome: string, msg: string) =>
  msg.toUpperCase().startsWith(nome.toUpperCase()) ? msg : `${nome}: ${msg}`;

const fmt = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const lista = (arqs: readonly ArquivoEntrada[]) => arqs.map((a) => a.nome).join(", ");
const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Avisos, arquivos lidos e ignorados de uma importação. */
class Coleta {
  readonly avisos: string[] = [];
  readonly lidos = new Set<string>();
  readonly ignorados: { arquivo: string; motivo: string }[] = [];

  /** Os arquivos ficam de fora com um aviso só: "A, B: motivo". */
  ignora(arqs: readonly ArquivoEntrada[], motivo: string) {
    if (arqs.length === 0) return;
    for (const a of arqs) this.ignorados.push({ arquivo: a.nome, motivo });
    this.avisos.push(`${lista(arqs)}: ${motivo}`);
  }

  le(...arqs: (ArquivoEntrada | undefined)[]) {
    for (const a of arqs) if (a) this.lidos.add(a.nome);
  }

  /** Roda `f`; uma exceção vira aviso com o arquivo, e o arquivo fica de fora. */
  seguro<T>(arqs: readonly ArquivoEntrada[], f: () => T): T | undefined {
    try {
      return f();
    } catch (e) {
      this.ignora(arqs, `não foi possível ler (${mensagemDe(e)}); ficou de fora.`);
      return undefined;
    }
  }
}

/** Agrupa por extensão. Extensão que a importação não lê vira aviso e fica de fora. */
function agrupar(arquivos: readonly ArquivoEntrada[], c: Coleta): Map<string, ArquivoEntrada[]> {
  const grupos = new Map<string, ArquivoEntrada[]>();
  const naoLidos = new Map<string, ArquivoEntrada[]>();
  for (const arq of [...arquivos].sort(porNome)) {
    const ext = extensaoDe(arq.nome);
    const temLeitor = LEITORES_EXTRA.some((l) => l.extensao === ext);
    const motivo = temLeitor
      ? undefined
      : (NAO_LIDOS[ext] ?? (TEXTO.has(ext) || VIGAS.has(ext) ? undefined : ""));
    if (motivo !== undefined) {
      naoLidos.set(motivo, [...(naoLidos.get(motivo) ?? []), arq]);
      continue;
    }
    grupos.set(ext, [...(grupos.get(ext) ?? []), arq]);
  }
  for (const [motivo, arqs] of naoLidos)
    c.ignora(arqs, motivo || "extensão não reconhecida, arquivo ignorado.");
  return grupos;
}

/** Um pavimento por .LAJ, com o nível do .COL de mesmo nome (1-based) quando há. */
interface PavimentoDoLaj {
  laj: ArquivoEntrada;
  base: string;
  nivel?: number;
}

/** Ordem dos pavimentos, do topo para a base: os que têm nível no .COL pela cota; os
 *  outros, em ordem alfabética, no topo. Sem nenhum nível casado, o k-ésimo de baixo é
 *  o nível k + 1 do .COL (a regra antiga do importador de pilares). A ordem vai num aviso. */
function ordenarPavimentos(
  lajes: readonly ArquivoEntrada[],
  niveis: readonly NivelCol[] | undefined,
  avisos: string[],
): PavimentoDoLaj[] {
  const nivelDoNome = (base: string) => {
    const i = niveis?.findIndex((n) => n.nome.trim().toUpperCase() === base) ?? -1;
    // o nível 1 é a base dos pilares (fundação): não é pavimento
    return i >= 1 ? i + 1 : undefined;
  };
  const pavs: PavimentoDoLaj[] = lajes.map((laj) => {
    const base = baseDe(laj.nome);
    const nivel = nivelDoNome(base);
    return { laj, base, ...(nivel !== undefined ? { nivel } : {}) };
  });
  const comNivel = pavs.filter((p) => p.nivel !== undefined).sort((a, b) => b.nivel! - a.nivel!);
  const semNivel = pavs.filter((p) => p.nivel === undefined);
  const ordem = [...semNivel, ...comNivel];
  if (pavs.length > 1 || (niveis && semNivel.length > 0)) {
    const descricao = ordem
      .map((p) =>
        p.nivel !== undefined && niveis
          ? `${p.base} (nível ${p.nivel} do .COL, cota ${fmt(niveis[p.nivel - 1]!.cota)} m)`
          : p.base,
      )
      .join(", ");
    const nomes =
      niveis
        ?.slice(1)
        .map((n) => n.nome.trim())
        .join(", ") ?? "";
    const regra =
      semNivel.length === 0
        ? "pelas cotas do .COL"
        : !niveis
          ? "em ordem alfabética do nome, porque sem .COL não há cota; confira e, se preciso, reordene os pavimentos"
          : comNivel.length === 0
            ? `nenhum .LAJ tem o nome de um nível do .COL (${nomes}): em ordem alfabética, casados com os níveis de baixo para cima, o de baixo no nível 2; confira`
            : `${semNivel.map((p) => p.base).join(", ")} sem nível de mesmo nome no .COL (${nomes}): ${semNivel.length > 1 ? "ficaram" : "ficou"} no topo, em ordem alfabética, com pé-direito de 3 m e os pilares do .LAJ; confira`;
    avisos.push(`Pavimentos, do topo para a base: ${descricao} (${regra}).`);
  }
  return ordem;
}

/** Registros do .VIG para o "apoia em" do .LAJ; um .VIG ilegível fica para o
 *  importador de vigas, que diz o erro. */
function registrosDoVig(vig: ArquivoEntrada | undefined) {
  if (!vig) return undefined;
  try {
    return lerVig(vig.dados);
  } catch {
    return undefined;
  }
}

/** Pé-direito do pavimento no nível k do .COL: a diferença de cota para o nível de baixo. */
function peDireitoDoNivel(niveis: readonly NivelCol[], k: number): number | undefined {
  const a = niveis[k - 2];
  const b = niveis[k - 1];
  if (!a || !b) return undefined;
  const pd = Math.round((b.cota - a.cota) * 1e6) / 1e6;
  return pd > 0 ? pd : undefined;
}

/** A obra só de vigas que o importador de vigas gera a partir do .VIG da base (com o
 *  .SEC/.FOR/.TAB de mesmo nome e os da obra), com o pavimento chamado pela base. */
function obraDeVigas(
  base: string,
  arquivos: readonly ArquivoEntrada[],
  c: Coleta,
): Obra | undefined {
  const vig = `${base}.VIG`;
  const r = c.seguro(arquivos, () => importarVigasSistrut(arquivos));
  if (!r) return undefined;
  if (!r.ok) {
    c.ignora(arquivos, `${r.erros.join(" ")} As vigas deste arquivo ficaram de fora.`);
    return undefined;
  }
  c.le(...arquivos);
  c.avisos.push(...r.avisos.map((a) => comArquivo(vig, a)));
  return {
    ...r.obra,
    pavimentos: r.obra.pavimentos.map((p) => ({ ...p, id: base, nome: base })),
  };
}

/** Vigas que não são de pavimento nenhum (.VIG sem .LAJ de mesmo nome, como uma escada
 *  calculada à parte no VIGA): a obra só de vigas do importador vira um pavimento à
 *  parte, no topo. Cada apoio tem um pilar só para a viga ficar de pé na planta: a
 *  reação não vai a pilar nenhum (apoio desconsiderado) e o pilar é marcado como sobre
 *  viga de transição, para não pesar no prédio. */
function pavimentoDeVigasAvulsas(
  base: string,
  arquivos: readonly ArquivoEntrada[],
  c: Coleta,
): Pavimento | undefined {
  const pav = obraDeVigas(base, arquivos, c)?.pavimentos[0];
  if (!pav) return undefined;
  const apoiosEmViga: string[] = [];
  for (const v of pav.vigas) {
    const n = (v.vaos?.length ?? 1) + 1;
    v.apoiosDesconsiderados = Array.from({ length: n }, (_, k) => k);
    const titulos = (v.forma?.apoios ?? []).flatMap((a) =>
      a.tipo === "V" && a.titulo ? [a.titulo] : [],
    );
    if (titulos.length > 0) apoiosEmViga.push(`${v.nome} em ${titulos.join(" e ")}`);
  }
  c.avisos.push(
    `${base}.VIG: não há ${base}.LAJ e o .VIG não diz de que pavimento são as vigas ${pav.vigas.map((v) => v.nome).join(", ")}. Elas entraram como vigas avulsas, no pavimento "${base}" no topo da obra, fora da planta do prédio, cada uma com um apoio em cada ponta; a reação não vai a pilar nem a viga nenhuma${apoiosEmViga.length > 0 ? ` (pelo .FOR, ${apoiosEmViga.join("; ")})` : ""}. Se a escada carrega o prédio, lance as reações como carga nas vigas de apoio.`,
  );
  return { ...pav, pilares: pav.pilares.map((p) => ({ ...p, transicao: true as const })) };
}

/** Menor y da planta dos pavimentos (vigas, pilares e lajes), m. */
function menorY(pavimentos: readonly Pavimento[]): number {
  const ys = pavimentos.flatMap((p) => [
    ...p.vigas.flatMap((v) => [v.y1, v.y2]),
    ...p.pilares.map((q) => q.y),
    ...p.lajes.flatMap((l) => [l.y, ...(l.poligono ?? []).map((v) => v.y)]),
  ]);
  return ys.length > 0 ? Math.min(...ys) : 0;
}

/** Desce um pavimento sem planta própria (vigas avulsas, outra obra só de vigas) para
 *  `ENTRE_PLANTAS` abaixo de `limite`: o motor liga pilares de níveis diferentes pela
 *  posição, e os pilares inventados para os apoios não podem cair sobre outro pilar. */
const ENTRE_PLANTAS = 5;
function abaixoDe(pav: Pavimento, limite: number): Pavimento {
  const ys = [...pav.vigas.flatMap((v) => [v.y1, v.y2]), ...pav.pilares.map((q) => q.y)];
  if (ys.length === 0) return pav;
  const dy = limite - ENTRE_PLANTAS - Math.max(...ys);
  const desce = (y: number) => Math.round((y + dy) * 1e6) / 1e6;
  return {
    ...pav,
    vigas: pav.vigas.map((v) => ({ ...v, y1: desce(v.y1), y2: desce(v.y2) })),
    pilares: pav.pilares.map((q) => ({ ...q, y: desce(q.y) })),
  };
}

/** O .COL tem cargas gravadas (A_1280, que o PILGEEDI grava a partir dos .REP lidos). */
const temCargas = (col: ArquivoCol) =>
  col.temCargas && col.colunas.some((c) => c.niveis.some((n) => (n.carga?.normal ?? 0) !== 0));

/** O pavimento de um .LAJ no formato de entrada da V1, com o .VIG e o .COL desse formato. */
function pavimentoDaV1(
  p: PavimentoDoLaj,
  v1: readonly ArquivoEntrada[],
  c: Coleta,
): Obra | undefined {
  const doMesmo = (ext: string) =>
    v1.find((a) => extensaoDe(a.nome) === ext && baseDe(a.nome) === p.base) ??
    (ext === "COL" ? v1.find((a) => extensaoDe(a.nome) === ext) : undefined);
  const arqs = [p.laj, doMesmo("VIG"), doMesmo("COL")].filter((a) => a !== undefined);
  const r = c.seguro(arqs, () =>
    importarV1(arqs.map((a) => ({ nome: a.nome, texto: textoDe(a) }))),
  );
  if (!r) return undefined;
  if (!r.ok) {
    c.ignora(arqs, `${r.erros.join(" ")} O pavimento ficou de fora.`);
    return undefined;
  }
  c.le(...arqs);
  c.avisos.push(
    `${lista(arqs)}: formato de entrada da OpenStrut V1 (cabeçalho ${CABECALHO_V1}), lido pelo importador da V1: lajes retangulares com bordos e cargas; vigas e pilares gerados a partir das lajes. Confira a planta.`,
    ...r.avisos.map((a) => comArquivo(p.laj.nome, a)),
  );
  return {
    ...r.obra,
    pavimentos: r.obra.pavimentos.map((q) => ({ ...q, id: p.base, nome: p.base })),
  };
}

/** Resumo dos pavimentos da obra, do topo para a base. */
const resumoDe = (obra: Obra | undefined, c: Coleta): ResumoImportacao => ({
  pavimentos: (obra?.pavimentos ?? []).map((p) => ({
    nome: p.nome,
    peDireito: p.peDireito,
    lajes: p.lajes.length,
    vigas: p.vigas.length,
    pilares: p.pilares.length,
  })),
  lidos: [...c.lidos].sort(),
  ignorados: c.ignorados,
});

/**
 * Monta uma obra a partir dos arquivos de uma obra do SISTRUT. Cada .LAJ vira um
 * pavimento; sem .LAJ, a obra sai do .VIG ou do .COL. Nunca lança: o que um arquivo não
 * deixa ler fica de fora com aviso, e só não há obra quando nenhum .LAJ, .VIG ou .COL
 * pôde ser lido ou quando a obra montada não passa na validação do arquivo da V2 (a
 * mensagem diz o arquivo, o item e o que fazer). Avisos de todas as etapas voltam numa
 * lista só, com o resumo, para mostrar antes de abrir a obra. A saída não depende da
 * ordem de `arquivos`.
 */
export function importarObraSistrut(
  arquivos: readonly ArquivoEntrada[],
): ResultadoImportacaoSistrut {
  const c = new Coleta();
  try {
    return importar(arquivos, c);
  } catch (e) {
    return {
      ok: false,
      erros: [`Erro inesperado na importação (${mensagemDe(e)}). Envie os arquivos ao suporte.`],
      resumo: resumoDe(undefined, c),
    };
  }
}

function importar(arquivos: readonly ArquivoEntrada[], c: Coleta): ResultadoImportacaoSistrut {
  const { avisos } = c;
  const grupos = agrupar(arquivos, c);
  const grupo = (ext: string) => grupos.get(ext) ?? [];

  // formato de entrada da V1: o .LAJ, o .VIG e o .COL vão juntos ao importador da V1
  const v1 = [...grupos.values()]
    .flat()
    .filter((a) => TEXTO.has(extensaoDe(a.nome)) || extensaoDe(a.nome) === "VIG")
    .filter(ehV1);
  for (const [ext, arqs] of grupos)
    grupos.set(
      ext,
      arqs.filter((a) => !v1.includes(a)),
    );
  const lajV1 = v1.filter((a) => extensaoDe(a.nome) === "LAJ");
  const basesV1 = new Set(lajV1.map((a) => baseDe(a.nome)));
  const v1Soltos = v1.filter(
    (a) =>
      extensaoDe(a.nome) !== "LAJ" &&
      !(
        ["VIG", "COL"].includes(extensaoDe(a.nome)) &&
        (basesV1.has(baseDe(a.nome)) || (extensaoDe(a.nome) === "COL" && lajV1.length > 0))
      ),
  );
  c.ignora(
    v1Soltos,
    `formato de entrada da OpenStrut V1 (cabeçalho ${CABECALHO_V1}): desse formato só o .LAJ, com o .VIG e o .COL dele, é importado.`,
  );

  // .COL: o do prédio inteiro; níveis (nome e cota) para a ordem dos pavimentos
  const cols = grupo("COL");
  const [col, ...colsExtras] = cols;
  c.ignora(colsExtras, `mais de um .COL; o .COL é do prédio inteiro e valeu o ${col?.nome}.`);
  const colLido = col ? c.seguro([col], () => lerCol(textoDe(col))) : undefined;
  if (col && colLido && !colLido.ok)
    c.ignora([col], `${colLido.erros.join(" ")} Os pilares do .COL ficaram de fora.`);
  const colOk = colLido?.ok ? { arq: col!, valor: colLido.valor } : undefined;
  const niveis = colOk?.valor.niveis;

  // 1. Lajes: um pavimento por .LAJ (de base única), na ordem do prédio
  const lajes: ArquivoEntrada[] = [];
  for (const a of [...grupo("LAJ"), ...lajV1].sort(porNome)) {
    if (lajes.some((l) => baseDe(l.nome) === baseDe(a.nome)))
      c.ignora([a], `outro .LAJ com o mesmo nome (${baseDe(a.nome)}) já entrou.`);
    else lajes.push(a);
  }
  const pavs = ordenarPavimentos(lajes, niveis, avisos);
  const comNivel = pavs.some((p) => p.nivel !== undefined);
  const vigs = grupo("VIG");
  let obra: Obra | undefined;
  const bases = new Set<string>();
  const junta = (nova: Obra) => {
    obra = obra ? { ...obra, pavimentos: [...obra.pavimentos, ...nova.pavimentos] } : nova;
  };
  for (const [i, p] of pavs.entries()) {
    if (v1.includes(p.laj)) {
      const daV1 = pavimentoDaV1(p, v1, c);
      if (daV1) {
        junta(daV1);
        bases.add(p.base);
      }
      continue;
    }
    const registrosVig = registrosDoVig(vigs.find((v) => baseDe(v.nome) === p.base));
    // nível: o do nome; sem nenhum casado, de baixo para cima (o de baixo é o nível 2)
    const nivel = comNivel ? p.nivel : niveis ? pavs.length - i + 1 : undefined;
    const peDireito = nivel !== undefined && niveis ? peDireitoDoNivel(niveis, nivel) : undefined;
    const lida = c.seguro([p.laj], () =>
      importarLaj(
        textoDe(p.laj),
        {
          pavimento: { id: p.base, nome: p.base },
          ...(peDireito ? { peDireito } : {}),
          ...(registrosVig ? { registrosVig } : {}),
        },
        p.laj.nome,
      ),
    );
    if (!lida) continue;
    if (!lida.ok) {
      c.ignora(
        [p.laj],
        `${lida.erros.map((e) => semArquivo(p.laj.nome, e)).join(" ")} O pavimento ${p.base} ficou de fora.`,
      );
      continue;
    }
    c.le(p.laj);
    avisos.push(...lida.avisos.map((a) => comArquivo(p.laj.nome, a)));
    junta(lida.obra);
    bases.add(p.base);
  }
  if (obra && colOk?.valor.obra) obra.nome = colOk.valor.obra;

  // 2. Vigas: as do .VIG de mesmo nome entram no pavimento; o .DSP e os .INI valem para todos
  const familia = [...VIGAS].flatMap((ext) => grupo(ext)).sort(porNome);
  // .INI: o VIGA.INI e o DESENHO.INI entram nas vigas; os outros não mudam o cálculo
  // ou ainda não são lidos (LAJE.INI, PILAR.INI)
  const ehIniDeViga = (a: ArquivoEntrada) =>
    extensaoDe(a.nome) !== "INI" || ["VIGA", "DESENHO"].includes(baseDe(a.nome));
  for (const a of familia.filter((x) => !ehIniDeViga(x)))
    c.ignora(
      [a],
      INI_NAO_LIDOS[baseDe(a.nome)] ??
        (["LAJE", "PILAR"].includes(baseDe(a.nome))
          ? `parâmetros do ${baseDe(a.nome)} que a importação ainda não lê; valem os de fábrica.`
          : "configuração que a importação não conhece; ignorada."),
    );
  const daObra = familia.filter((a) => VIGAS_DA_OBRA.has(extensaoDe(a.nome)) && ehIniDeViga(a));
  const doBase = (b: string) =>
    familia.filter((a) => !VIGAS_DA_OBRA.has(extensaoDe(a.nome)) && baseDe(a.nome) === b);
  for (const b of bases) {
    const doPav = doBase(b);
    if (doPav.length === 0 || !obra) continue;
    const vig = doPav.find((a) => extensaoDe(a.nome) === "VIG");
    if (!vig) {
      c.ignora(
        doPav,
        `sem o ${b}.VIG, que é a entrada das vigas; ${doPav.length > 1 ? "ignorados" : "ignorado"}.`,
      );
      continue;
    }
    const base: Obra = obra;
    const vigas = c.seguro(doPav, () => importarVigasSistrut([...doPav, ...daObra], base, b));
    if (!vigas) continue;
    if (!vigas.ok) {
      c.ignora(doPav, `${vigas.erros.join(" ")} As vigas do pavimento ${b} ficaram as do .LAJ.`);
      continue;
    }
    c.le(...doPav, ...daObra);
    avisos.push(...vigas.avisos.map((a) => comArquivo(vig.nome, a)));
    obra = vigas.obra;
  }

  // .VIG sem .LAJ de mesmo nome: com prédio, vigas avulsas num pavimento à parte; sem
  // .LAJ, a obra é a de vigas (cada .VIG um pavimento, como cada obra do VIGA)
  const semLaj = new Map<string, ArquivoEntrada[]>();
  for (const a of familia) {
    const b = baseDe(a.nome);
    if (VIGAS_DA_OBRA.has(extensaoDe(a.nome)) || bases.has(b)) continue;
    semLaj.set(b, [...(semLaj.get(b) ?? []), a]);
  }
  const pavimentosAvulsos: Pavimento[] = [];
  const temPredio = obra !== undefined;
  for (const [b, arqs] of semLaj) {
    if (!arqs.some((a) => extensaoDe(a.nome) === "VIG")) {
      c.ignora(arqs, `sem ${b}.VIG nem ${b}.LAJ; ${arqs.length > 1 ? "ignorados" : "ignorado"}.`);
      continue;
    }
    if (temPredio) {
      const pav = pavimentoDeVigasAvulsas(b, [...arqs, ...daObra], c);
      if (pav) pavimentosAvulsos.push(pav);
      continue;
    }
    const deVigas = obraDeVigas(b, [...arqs, ...daObra], c);
    if (!deVigas) continue;
    bases.add(b);
    const anterior: Obra | undefined = obra;
    obra = anterior
      ? {
          ...anterior,
          pavimentos: [
            ...anterior.pavimentos,
            ...deVigas.pavimentos.map((p) => abaixoDe(p, menorY(anterior.pavimentos))),
          ],
        }
      : deVigas;
  }
  if (!temPredio && obra && bases.size > 1)
    avisos.push(
      `Sem .LAJ, cada .VIG virou um pavimento (${[...bases].join(", ")}), em ordem alfabética do topo para a base; confira a ordem.`,
    );

  // 3. Pilares. O .REP de um pavimento importado é o que o motor recalcula pelas vigas
  // dele: entrar com ele somaria a carga duas vezes (`Pilar.cargaTopo` soma com o .REP
  // do pavimento). Um .REP de outra obra entra como carga no nível do .COL de mesmo nome,
  // como o PILGEEDI o leria; numa obra só de pilares, valem as cargas do .COL, que o
  // PILGEEDI grava dos .REP lidos, e o .REP só entra se o .COL não as tem.
  const repArqs = grupo("REP");
  const rlps = grupo("RLP");
  c.ignora(
    repArqs.filter((r) => bases.has(baseDe(r.nome))),
    "reações das vigas nos pilares, que o motor recalcula pelas vigas de cada pavimento; não entram como carga, para não contar duas vezes.",
  );
  c.ignora(
    rlps.filter((r) => bases.has(baseDe(r.nome))),
    "inclinações das vigas nos pilares, que o motor recalcula pela planta (parâmetro .RLP dos pilares); não usado.",
  );
  c.ignora(
    rlps.filter(
      (r) =>
        !bases.has(baseDe(r.nome)) && !repArqs.some((rep) => baseDe(rep.nome) === baseDe(r.nome)),
    ),
    "sem .REP de mesmo nome, arquivo ignorado.",
  );
  const repsDeFora = repArqs.filter((r) => !bases.has(baseDe(r.nome)));
  const pips = grupo("PIP");
  const pils = grupo("PIL");
  if (!colOk) {
    c.ignora(
      [
        ...repsDeFora,
        ...rlps.filter((r) => repsDeFora.some((rep) => baseDe(rep.nome) === baseDe(r.nome))),
      ],
      "sem o .COL, que tem os pilares do prédio, as cargas do .REP não têm onde entrar; ignorado.",
    );
    c.ignora(
      [...pips, ...pils],
      `sem o .COL, que tem os pilares do prédio; ${pips.length + pils.length > 1 ? "ignorados" : "ignorado"}.`,
    );
  } else {
    const [pip, ...pipsExtras] = pips;
    const [pil, ...pilsExtras] = pils;
    c.ignora(
      [...pipsExtras, ...pilsExtras],
      "mais de um .PIP ou .PIL; valeu o primeiro de cada, em ordem de nome.",
    );
    const soPilares = obra === undefined;
    const usaReps = !soPilares || !temCargas(colOk.valor);
    if (soPilares && !usaReps)
      c.ignora(
        repsDeFora,
        "as cargas dos pilares são as que o .COL guarda (o PILGEEDI as grava dos .REP lidos); o .REP não entra de novo.",
      );
    const reps: RepPilarSistrut[] = [];
    const repsLidos: ArquivoEntrada[] = [];
    for (const rep of usaReps ? repsDeFora : []) {
      const k = niveis?.findIndex((n) => n.nome.trim().toUpperCase() === baseDe(rep.nome)) ?? -1;
      if (k < 0) {
        c.ignora(
          [rep],
          `não há pavimento nem nível do .COL chamado ${baseDe(rep.nome)}; as cargas não foram importadas. Lance-as como carga no topo dos pilares do nível certo.`,
        );
        continue;
      }
      const rlp = rlps.find((r) => baseDe(r.nome) === baseDe(rep.nome));
      repsLidos.push(rep, ...(rlp ? [rlp] : []));
      reps.push({
        texto: textoDe(rep),
        nivelInicial: k + 1,
        nivelFinal: k + 1,
        ...(rlp ? { rlp: textoDe(rlp) } : {}),
      });
    }
    const niveisDosPavimentos = comNivel
      ? Object.fromEntries(pavs.flatMap((p) => (p.nivel !== undefined ? [[p.base, p.nivel]] : [])))
      : undefined;
    const doCol = [colOk.arq, pip, pil, ...repsLidos].filter((a) => a !== undefined);
    const base = obra;
    const pilares = c.seguro(doCol, () =>
      importarPilaresSistrut(
        {
          col: textoDe(colOk.arq),
          ...(pip ? { pip: textoDe(pip) } : {}),
          ...(pil ? { pil: textoDe(pil) } : {}),
          ...(reps.length > 0 ? { reps } : {}),
        },
        base
          ? {
              base,
              cargas: reps.length > 0,
              ...(niveisDosPavimentos ? { niveis: niveisDosPavimentos } : {}),
            }
          : {},
      ),
    );
    if (pilares && "erros" in pilares)
      c.ignora(doCol, `${pilares.erros.join(" ")} Os pilares do .COL ficaram de fora.`);
    else if (pilares) {
      c.le(...doCol);
      avisos.push(...pilares.avisos.map((a) => comArquivo(colOk.arq.nome, a)));
      obra = pilares.obra;
    }
  }

  if (!obra)
    return {
      ok: false,
      erros: [
        "Nenhuma obra para abrir: entre os arquivos não há .LAJ, .VIG nem .COL que se possa ler. A obra começa pelo .LAJ de cada pavimento (ou pelo .VIG, numa obra só de vigas, ou pelo .COL, numa só de pilares).",
        ...c.ignorados.map((i) => `${i.arquivo}: ${i.motivo}`),
      ],
      resumo: resumoDe(undefined, c),
    };
  let final: Obra = obra;
  for (const pav of pavimentosAvulsos)
    final = {
      ...final,
      pavimentos: [abaixoDe(pav, menorY(final.pavimentos)), ...final.pavimentos],
    };

  // 4. Leitores que completam a obra montada (LEITORES_EXTRA), cada um com os arquivos
  // da extensão dele
  for (const leitor of LEITORES_EXTRA) {
    const arqs = grupo(leitor.extensao);
    if (arqs.length === 0) continue;
    const base = final;
    const r = c.seguro(arqs, () =>
      leitor.completa(
        base,
        arqs.map((a) => ({ ...a, texto: textoDe(a) })),
      ),
    );
    if (!r) continue;
    final = r.obra;
    avisos.push(...r.avisos);
    for (const i of r.ignorados ?? []) c.ignorados.push(i);
    c.le(...arqs.filter((a) => !(r.ignorados ?? []).some((i) => i.arquivo === a.nome)));
  }

  // a obra inteira passa pela validação de um arquivo aberto
  const lida = lerObra(serializarObra(final));
  if (!lida.ok) {
    const origem = (i: number): OrigemPavimento => {
      const b = final.pavimentos[i]?.id ?? "";
      const nome = (ext: string) =>
        arquivos.find((a) => baseDe(a.nome) === b && extensaoDe(a.nome) === ext)?.nome;
      const laj = nome("LAJ");
      const vig = nome("VIG");
      return {
        ...(laj ? { laj } : {}),
        ...(vig ? { vig } : {}),
        ...(colOk ? { col: colOk.arq.nome } : {}),
      };
    };
    return {
      ok: false,
      erros: explicarErros(lida.erros, final, origem),
      resumo: resumoDe(final, c),
    };
  }
  return { ok: true, obra: lida.obra, avisos, resumo: resumoDe(lida.obra, c) };
}
