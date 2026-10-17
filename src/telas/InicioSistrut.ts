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
// fim do arquivo e CR sozinho é fim de linha. Os binários (.VIG, .SEC, .FOR, .TAB) vão
// como bytes; o .DSP e os .INI, que são texto, também vão como bytes ao importador de
// vigas, que os lê com o leitor do DESENHO (^Z e CR inclusive).
import { lerObra, serializarObra } from "../armazenamento/arquivo";
import { importarV1 } from "../armazenamento/importarV1";
import { aplicarEdv } from "../armazenamento/sistrut/edv";
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
import { calcularObraSistrut } from "../calculo/sistrut/obra";
import { casaNome } from "../calculo/sistrut/pilares/carga";
import type { Obra, Pavimento, Pilar } from "../dominio/obra";

export interface ArquivoEntrada {
  nome: string;
  dados: Uint8Array;
  /** Caminho dentro da pasta escolhida (só nas mensagens). */
  caminho?: string;
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
 *  .EDV para o detalhamento das vigas. Recebe a obra, todos os arquivos da extensão
 *  (com o texto lido como o QuickBASIC lê) e todos os arquivos selecionados (o .EDV casa
 *  pela ordem das vigas no .VIG) e devolve a obra completa. Uma exceção vira
 *  aviso e os arquivos ficam de fora; `ignorados` são os que ele não usou, com o motivo.
 *  Com um leitor registrado, a extensão sai de `NAO_LIDOS`. */
export interface LeitorExtra {
  extensao: string;
  completa(
    obra: Obra,
    arquivos: readonly (ArquivoEntrada & { texto: string })[],
    todos: readonly ArquivoEntrada[],
  ): { obra: Obra; avisos: string[]; ignorados?: { arquivo: string; motivo: string }[] };
}
/** Os leitores extras, na ordem em que rodam. */
export const LEITORES_EXTRA: LeitorExtra[] = [
  {
    extensao: "EDV",
    completa: (obra, edvs, todos) =>
      aplicarEdv(
        obra,
        edvs,
        todos.filter((a) => extensaoDe(a.nome) === "VIG"),
      ),
  },
];

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

/** A importação lê o conteúdo de um arquivo com este nome (a tela não precisa carregar os
 *  outros: eles só entram no resumo, com o motivo). */
export function extensaoLida(nome: string): boolean {
  const ext = extensaoDe(nome);
  return TEXTO.has(ext) || VIGAS.has(ext) || LEITORES_EXTRA.some((l) => l.extensao === ext);
}

/** O arquivo é de uma obra do SISTRUT (lido ou ignorado com motivo próprio). */
export const extensaoDoSistrut = (nome: string) =>
  extensaoLida(nome) || NAO_LIDOS[extensaoDe(nome)] !== undefined;

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
  /** O nível do .COL (o de baixo, num pavimento-tipo). */
  nivel?: number;
  /** Níveis seguidos do .COL com o nome do .LAJ: o pavimento-tipo. */
  repeticoes: number;
  /** O .LAJ tem o nome do nível 1 do .COL, a base dos pilares (o baldrame). */
  fundacao?: true;
}

/** "1 FUND, 2 TER, 3 SUP": os níveis do .COL para as mensagens. */
const nomesDosNiveis = (niveis: readonly NivelCol[]) =>
  niveis.map((n, i) => `${i + 1} ${n.nome.trim()}`).join(", ");

/** Ordem dos pavimentos, do topo para a base: os que têm nível no .COL pela cota; os
 *  outros, em ordem alfabética, no topo; o do nível 1 (a base dos pilares), na base. Sem
 *  nenhum nível casado, o k-ésimo de baixo é o nível k + 1 do .COL (a regra antiga do
 *  importador de pilares). Níveis seguidos com o mesmo nome são um pavimento-tipo. A
 *  ordem vai num aviso. */
function ordenarPavimentos(
  lajes: readonly ArquivoEntrada[],
  niveis: readonly NivelCol[] | undefined,
  avisos: string[],
): PavimentoDoLaj[] {
  const nomeDo = (k: number) => niveis?.[k]?.nome.trim().toUpperCase();
  const pavs: PavimentoDoLaj[] = lajes.map((laj) => {
    const base = baseDe(laj.nome);
    const i = niveis?.findIndex((n) => n.nome.trim().toUpperCase() === base) ?? -1;
    if (i === 0) return { laj, base, repeticoes: 1, fundacao: true };
    if (i < 0) return { laj, base, repeticoes: 1 };
    let repeticoes = 1;
    while (nomeDo(i + repeticoes) === base) repeticoes++;
    return { laj, base, nivel: i + 1, repeticoes };
  });
  const comNivel = pavs.filter((p) => p.nivel !== undefined).sort((a, b) => b.nivel! - a.nivel!);
  const semNivel = pavs.filter((p) => p.nivel === undefined && !p.fundacao);
  const fundacao = pavs.filter((p) => p.fundacao);
  const ordem = [...semNivel, ...comNivel, ...fundacao];
  if (pavs.length > 1 || (niveis && (semNivel.length > 0 || fundacao.length > 0))) {
    const descricao = ordem
      .map((p) => {
        if (p.fundacao) return `${p.base} (nível 1 do .COL, a base dos pilares)`;
        if (p.nivel === undefined || !niveis) return p.base;
        const faixa =
          p.repeticoes > 1
            ? `níveis ${p.nivel} a ${p.nivel + p.repeticoes - 1} do .COL, ${p.repeticoes} repetições`
            : `nível ${p.nivel} do .COL`;
        return `${p.base} (${faixa}, cota ${fmt(niveis[p.nivel - 1]!.cota)} m)`;
      })
      .join(", ");
    const nomes = niveis ? nomesDosNiveis(niveis) : "";
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
  for (const p of fundacao)
    avisos.push(
      `${p.laj.nome}: é o nível 1 do .COL (${niveis ? nomesDosNiveis(niveis) : ""}), a base dos pilares, onde fica o baldrame. A V2 não tem pavimento sem lance de pilar: ${p.base} entrou na base da obra com pé-direito de 3 m e os pilares do .LAJ, um lance abaixo do nível 1 que não existe no original. As vigas dele carregam esse lance e a fundação; confira.`,
    );
  for (const p of comNivel)
    if (p.repeticoes > 1 && niveis) {
      const alturas = Array.from({ length: p.repeticoes }, (_, r) =>
        peDireitoDoNivel(niveis, p.nivel! + r),
      );
      if (alturas.some((h) => h !== alturas[0]))
        avisos.push(
          `${p.laj.nome}: pavimento-tipo nos níveis ${p.nivel} a ${p.nivel! + p.repeticoes - 1} do .COL com pés-direitos diferentes (${alturas.map((h) => fmt(h ?? 0)).join(", ")} m); ficou o do nível ${p.nivel}.`,
        );
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
 *  viga de transição; sem carga, o motor não o calcula. No original é o mesmo: o VIGA
 *  calcula a escada sozinha, e o usuário lança as reações dela à mão nas vigas que a
 *  recebem, que já as trazem no .VIG delas. */
function pavimentoDeVigasAvulsas(
  base: string,
  arquivos: readonly ArquivoEntrada[],
  c: Coleta,
  /** Por que as vigas não entram num pavimento do prédio (padrão: não há .LAJ). */
  porque = `não há ${base}.LAJ e o .VIG não diz de que pavimento elas são`,
  /** Para onde vai a carga delas, frase inteira (padrão: as vigas que as recebem). */
  destino?: string,
  obraJaLida?: Obra,
): Pavimento | undefined {
  const pav = (obraJaLida ?? obraDeVigas(base, arquivos, c))?.pavimentos[0];
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
  const recebem =
    apoiosEmViga.length > 0
      ? `nas vigas que as recebem (pelo .FOR, ${apoiosEmViga.join("; ")})`
      : "nas vigas que as recebem";
  c.avisos.push(
    `${base}.VIG: ${porque}. As vigas ${pav.vigas.map((v) => v.nome).join(", ")} entraram à parte, no pavimento "${base}", fora da planta do prédio, com um apoio de cálculo em cada ponta. ${
      destino ??
      `Como no SISTRUT, a reação delas não vai a viga nem a pilar nenhum: o usuário do original lança essas reações à mão ${recebem}, e elas já estão nas cargas do .VIG dessas vigas. Por isso os apoios de ${base} não descarregam em pilar nem na fundação. Se alguma das vigas que recebem ${base} não tem essas reações, lance-as nela como carga.`
    }`,
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

/** Pavimento de um nível do .COL que não tem .LAJ: sem planta, só com os pilares das
 *  colunas do .COL que têm lance até ele. Cada pilar fica na posição do pilar de mesmo
 *  número no pavimento mais próximo (o motor liga os lances pela posição), ou, sem
 *  nenhum, abaixo da planta. As cargas do nível vêm do .COL ou do .REP dele. */
function pavimentoSemPlanta(
  k: number,
  col: ArquivoCol,
  pavimentos: readonly { pav: Pavimento; nivel: number }[],
): Pavimento {
  const nivel = col.niveis[k - 1]!;
  const id = `nivel${k}`;
  const porDistancia = [...pavimentos].sort(
    (a, b) => Math.abs(a.nivel - k) - Math.abs(b.nivel - k),
  );
  const yLivre = menorY(pavimentos.map((p) => p.pav)) - ENTRE_PLANTAS;
  const pilares: Pilar[] = col.colunas.flatMap((coluna, ci) => {
    if (!(coluna.nivelInferior <= k - 1 && coluna.nivelSuperior >= k)) return [];
    const vizinho = porDistancia
      .flatMap((p) => p.pav.pilares)
      .find((q) => {
        const n = /\d+/.exec(q.nome);
        return n !== null && casaNome(coluna.nome, Number(n[0]));
      });
    const nome = vizinho?.nome ?? (coluna.nome.replace(/\s+/g, "") || `C${ci + 1}`);
    return [
      {
        id: `${id}/${nome}`,
        nome,
        x: vizinho?.x ?? ci,
        y: vizinho?.y ?? yLivre,
        b: vizinho?.b ?? 20,
        h: vizinho?.h ?? 20,
        ...(vizinho?.rotacao !== undefined ? { rotacao: vizinho.rotacao } : {}),
      },
    ];
  });
  return {
    id,
    nome: nivel.nome.trim() || `Nível ${k}`,
    peDireito: peDireitoDoNivel(col.niveis, k) ?? 3,
    repeticoes: 1,
    lajes: [],
    vigas: [],
    pilares,
    pilaresRemovidos: [],
  };
}

/** Aviso de parâmetros próprios da instalação do usuário que não vieram: há .TAB (o
 *  DESENHO detalhou vigas com algum .DSP) e nenhum .DSP, ou o .COL usa uma parametrização
 *  de pilar que não é a SISTRUT e o .PIP dela não veio. Sem eles valem os de fábrica, e o
 *  detalhamento e o quadro podem divergir do .TAB (docs/sistrut/ARQUIVOS.md, seção 2). */
function parametrosProprios(
  grupo: (ext: string) => ArquivoEntrada[],
  pipDoCol: string | undefined,
): string | undefined {
  const pip = pipDoCol?.trim().toUpperCase();
  const pipFaltando =
    pip !== undefined && pip !== "SISTRUT" && !grupo("PIP").some((a) => baseDe(a.nome) === pip);
  const dspFaltando = grupo("TAB").length > 0 && grupo("DSP").length === 0;
  if (!pipFaltando && !dspFaltando) return undefined;
  const indicios = [
    ...(dspFaltando ? ["há .TAB do DESENHO e nenhum .DSP"] : []),
    ...(pipFaltando ? [`o .COL usa a parametrização ${pip}, que não veio`] : []),
  ];
  return `A obra parece usar parâmetros próprios (${indicios.join("; ")}): selecione também os arquivos de C:\\SISTRUT\\EXEC40 (o .DSP, o .LAP, o .PIP e os .INI), junto com os da obra. Sem eles valem os parâmetros de fábrica (SISTRUT), e o detalhamento e o quadro das vigas podem sair diferentes do .TAB do original.`;
}

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
  // dois arquivos com o mesmo nome (de pastas diferentes, ou só na caixa): qual valeria
  // seria escolha arbitrária
  const porNomeIgual = new Map<string, ArquivoEntrada[]>();
  for (const a of arquivos) {
    const k = a.nome
      .replace(/^.*[\\/]/, "")
      .trim()
      .toUpperCase();
    porNomeIgual.set(k, [...(porNomeIgual.get(k) ?? []), a]);
  }
  const repetidos = [...porNomeIgual.values()].filter((x) => x.length > 1);
  if (repetidos.length > 0)
    return {
      ok: false,
      erros: [
        `Arquivos com o mesmo nome: ${repetidos.map((x) => x.map((a) => a.caminho ?? a.nome).join(" e ")).join("; ")}. Eles vêm de obras diferentes? Importe uma pasta de cada vez, com os arquivos de uma obra só.`,
      ],
      resumo: resumoDe(undefined, c),
    };
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
  const nomeDoNivel = (k: number) => niveis?.[k - 1]?.nome.trim().toUpperCase();
  /** Nível do .COL (1-based) com o nome dado, ou -1. */
  const nivelDoNome = (nome: string) => {
    const i = niveis?.findIndex((n) => n.nome.trim().toUpperCase() === nome) ?? -1;
    return i < 0 ? -1 : i + 1;
  };

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
  /** Bases dos pavimentos com planta (o .REP deles é o que o motor recalcula). */
  const bases = new Set<string>();
  /** Bases dos .LAJ que não abriram: o .VIG fica avulso e o nível, sem planta. */
  const lajesFalhas = new Set<string>();
  /** Nível do .COL de cada pavimento (id), o de baixo num pavimento-tipo. */
  const nivelDoPavimento = new Map<string, number>();
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
    const nivel = comNivel ? p.nivel : niveis && !p.fundacao ? pavs.length - i + 1 : undefined;
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
    if (!lida?.ok) {
      if (lida)
        c.ignora(
          [p.laj],
          `${lida.erros.map((e) => semArquivo(p.laj.nome, e)).join(" ")} O pavimento ${p.base} ficou de fora.`,
        );
      lajesFalhas.add(p.base);
      continue;
    }
    c.le(p.laj);
    avisos.push(...lida.avisos.map((a) => comArquivo(p.laj.nome, a)));
    const pavimentos = lida.obra.pavimentos.map((q) => ({ ...q, repeticoes: p.repeticoes }));
    junta({ ...lida.obra, pavimentos });
    bases.add(p.base);
    if (comNivel && p.nivel !== undefined) nivelDoPavimento.set(p.base, p.nivel);
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
  // a montagem de cada pavimento só depende da planta dele: a obra é calculada uma vez
  const daPlanta = obra;
  const montagens = daPlanta
    ? c.seguro([], () => calcularObraSistrut(daPlanta, { modo: "original" }).pavimentos)
    : undefined;
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
    const montagem = montagens?.find((p) => p.pavimentoId === b)?.montagem.vigas;
    const vigas = c.seguro(doPav, () =>
      importarVigasSistrut([...doPav, ...daObra], base, b, montagem),
    );
    if (!vigas) continue;
    if (!vigas.ok) {
      c.ignora(doPav, `${vigas.erros.join(" ")} As vigas do pavimento ${b} ficaram as do .LAJ.`);
      continue;
    }
    c.le(...doPav, ...daObra);
    avisos.push(...vigas.avisos.map((a) => comArquivo(vig.nome, a)));
    obra = vigas.obra;
  }

  // .VIG sem .LAJ de mesmo nome. Com prédio: vigas avulsas num pavimento à parte. Sem
  // .LAJ e com .COL que nomeia os níveis delas: os pilares saem do .COL, e a carga de
  // cada nível é a do .REP dele ou a que o motor calcula pelas vigas do .VIG (o PILGEEDI
  // lê o .REP de cada obra do VIGA no nível dela). Sem nada disso, a obra é a de vigas
  // (cada .VIG um pavimento, como cada obra do VIGA).
  const semLaj = new Map<string, ArquivoEntrada[]>();
  for (const a of familia) {
    const b = baseDe(a.nome);
    if (VIGAS_DA_OBRA.has(extensaoDe(a.nome)) || bases.has(b)) continue;
    semLaj.set(b, [...(semLaj.get(b) ?? []), a]);
  }
  const pavimentosAvulsos: Pavimento[] = [];
  const temPredio = obra !== undefined;
  const vigasPeloCol =
    !temPredio && colOk !== undefined && [...semLaj.keys()].some((b) => nivelDoNome(b) >= 2);
  /** .REP calculado pelas vigas de um .VIG, por nível do .COL (obra só de vigas). */
  const repsDasVigas = new Map<number, RepPilarSistrut>();
  for (const [b, arqs] of semLaj) {
    if (!arqs.some((a) => extensaoDe(a.nome) === "VIG")) {
      c.ignora(arqs, `sem ${b}.VIG nem ${b}.LAJ; ${arqs.length > 1 ? "ignorados" : "ignorado"}.`);
      continue;
    }
    if (temPredio || vigasPeloCol) {
      const k = nivelDoNome(b);
      const deVigas = obraDeVigas(b, [...arqs, ...daObra], c);
      if (!deVigas) continue;
      if (vigasPeloCol && k >= 2) {
        const calculo = c.seguro([], () => calcularObraSistrut(deVigas, { modo: "original" }));
        const linhas = calculo?.pavimentos[0]?.rep;
        if (linhas)
          repsDasVigas.set(k, { linhas, nivelInicial: k, nivelFinal: k, nome: `${b}.VIG` });
      }
      const temRep = grupo("REP").some((r) => baseDe(r.nome) === b);
      const pav = pavimentoDeVigasAvulsas(
        b,
        arqs,
        c,
        lajesFalhas.has(b)
          ? `o ${b}.LAJ não pôde ser lido (ficou de fora), e as vigas não têm a planta`
          : vigasPeloCol
            ? "obra sem .LAJ: as vigas não têm planta"
            : undefined,
        vigasPeloCol && k >= 2
          ? `A reação delas chega aos pilares do .COL no nível ${k} (${nomeDoNivel(k)}) pelo ${temRep ? `${b}.REP` : ".REP que o motor calcula por elas"}.`
          : lajesFalhas.has(b) && k >= 2 && colOk
            ? `A reação delas não vai a pilar nenhum; nos pilares do nível ${k} (${nomeDoNivel(k)}) entra a carga do ${temRep ? `${b}.REP` : ".COL"}.`
            : undefined,
        deVigas,
      );
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

  // níveis do .COL sem pavimento (sem .LAJ, ou com o .LAJ que não abriu): pavimento sem
  // planta, com os pilares e as cargas do nível. Sem eles, o lance some com as cargas.
  const niveisSemPlanta: number[] = [];
  if (obra && colOk && comNivel && niveis) {
    const cobertos = new Set<number>();
    for (const p of pavs)
      if (p.nivel !== undefined && nivelDoPavimento.has(p.base))
        for (let r = 0; r < p.repeticoes; r++) cobertos.add(p.nivel + r);
    const comPlanta = obra.pavimentos.flatMap((pav) => {
      const nivel = nivelDoPavimento.get(pav.id);
      return nivel === undefined ? [] : [{ pav, nivel }];
    });
    const novos: Pavimento[] = [];
    for (let k = 2; k <= niveis.length; k++) {
      if (cobertos.has(k)) continue;
      const pav = pavimentoSemPlanta(k, colOk.valor, comPlanta);
      nivelDoPavimento.set(pav.id, k);
      niveisSemPlanta.push(k);
      novos.push(pav);
      const nome = nomeDoNivel(k) ?? "";
      const doNivel = grupo("REP").some((r) => baseDe(r.nome) === nome);
      avisos.push(
        `Nível ${k} do .COL (${niveis[k - 1]!.nome.trim()}, cota ${fmt(niveis[k - 1]!.cota)} m) sem ${lajesFalhas.has(nome) ? "o .LAJ, que não abriu" : ".LAJ de mesmo nome"}: entrou como pavimento sem planta, só com os ${pav.pilares.length} pilares do .COL, e as cargas dos pilares nesse nível são ${doNivel ? `as do ${nome}.REP` : "as que o .COL guarda"}. As vigas desse nível não estão na obra.`,
      );
    }
    // a ordem do prédio: os sem nível no topo, depois pelo nível, de cima para baixo, e o
    // do nível 1 na base
    const ordem = (p: Pavimento) => nivelDoPavimento.get(p.id) ?? 0;
    const fundacao = new Set(pavs.filter((p) => p.fundacao).map((p) => p.base));
    const todos = [...obra.pavimentos, ...novos];
    obra = {
      ...obra,
      pavimentos: [
        ...todos.filter((p) => !nivelDoPavimento.has(p.id) && !fundacao.has(p.id)),
        ...todos.filter((p) => nivelDoPavimento.has(p.id)).sort((a, b) => ordem(b) - ordem(a)),
        ...todos.filter((p) => fundacao.has(p.id)),
      ],
    };
  }

  // 3. Pilares. O .REP de um pavimento com planta é o que o motor recalcula pelas vigas
  // dele: entrar com ele somaria a carga duas vezes (`Pilar.cargaTopo` soma com o .REP
  // do pavimento). O .REP de um nível sem planta (ou de uma obra só de pilares) entra
  // como carga nesse nível, como o PILGEEDI o leria, no lugar das cargas que o .COL
  // guarda para o nível; nos outros níveis sem planta valem as do .COL.
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
    // o PILAREDI abre o .PIP com o nome que o .COL grava; "SISTRUT" é a tabela embutida,
    // sem arquivo (PILAREDI.BAS:1833)
    const nomePip = colOk.valor.parametros.pip.trim().toUpperCase();
    const pip = nomePip === "SISTRUT" ? undefined : pips.find((p) => baseDe(p.nome) === nomePip);
    c.ignora(
      pips.filter((p) => p !== pip),
      nomePip === "SISTRUT"
        ? 'o .COL usa a parametrização "SISTRUT", a tabela embutida: o PILAREDI não lê .PIP nenhum (PILAREDI.BAS:1833).'
        : `o .COL usa a parametrização ${nomePip}.PIP; o PILAREDI não lê outro .PIP.`,
    );
    const [pil, ...pilsExtras] = pils;
    c.ignora(pilsExtras, "mais de um .PIL; valeu o primeiro, em ordem de nome.");
    const soPilares = obra === undefined;
    // níveis sem planta: os criados acima e o 1, a base dos pilares, se nenhum .LAJ é dele
    const temFundacao = pavs.some((p) => p.fundacao && bases.has(p.base));
    const niveisComCarga = [...niveisSemPlanta, ...(temFundacao ? [] : [1])];
    const reps: RepPilarSistrut[] = [];
    const repsLidos: ArquivoEntrada[] = [];
    for (const rep of repsDeFora) {
      const k = nivelDoNome(baseDe(rep.nome));
      if (!(k >= 1 && (soPilares || niveisComCarga.includes(k)))) {
        c.ignora(
          [rep],
          k >= 1
            ? `o nível ${k} do .COL (${nomeDoNivel(k)}) tem planta, e o motor recalcula as cargas dele pelas vigas; o .REP não entra como carga.`
            : `não há pavimento nem nível do .COL chamado ${baseDe(rep.nome)} (níveis: ${nomesDosNiveis(colOk.valor.niveis)}); as cargas não foram importadas. Lance-as como carga no topo dos pilares do nível certo.`,
        );
        continue;
      }
      const rlp = rlps.find((r) => baseDe(r.nome) === baseDe(rep.nome));
      repsLidos.push(rep, ...(rlp ? [rlp] : []));
      reps.push({
        texto: textoDe(rep),
        nivelInicial: k,
        nivelFinal: k,
        nome: rep.nome,
        ...(rlp ? { rlp: textoDe(rlp) } : {}),
      });
    }
    // o .REP calculado pelas vigas de um .VIG só vale onde o .REP não veio
    for (const [k, r] of repsDasVigas) if (!reps.some((x) => x.nivelInicial === k)) reps.push(r);
    const niveisDosPavimentos =
      nivelDoPavimento.size > 0 ? Object.fromEntries(nivelDoPavimento) : undefined;
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
              ...(niveisDosPavimentos ? { niveis: niveisDosPavimentos } : {}),
              niveisComCarga,
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

  const proprios = parametrosProprios(grupo, colOk?.valor.parametros.pip);
  if (proprios) avisos.push(proprios);

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
  for (const pav of pavimentosAvulsos) {
    // id e nome únicos: o nível do .COL pode ter o mesmo nome do .VIG
    const repetido = (x: string) =>
      final.pavimentos.some((p) => p.id === x || p.nome.toUpperCase() === x.toUpperCase());
    const avulso = repetido(pav.id)
      ? { ...pav, id: `${pav.id}-vigas`, nome: `${pav.nome} (vigas)` }
      : pav;
    final = {
      ...final,
      pavimentos: [abaixoDe(avulso, menorY(final.pavimentos)), ...final.pavimentos],
    };
  }

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
        arquivos,
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
