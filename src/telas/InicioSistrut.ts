// Importação de uma obra a partir dos arquivos do SISTRUT escolhidos de uma vez.
// Cada arquivo é classificado pela extensão. A obra sai na ordem .LAJ → vigas → pilares,
// e cada importador (laje.ts, viga.ts, pilar.ts) recebe o que o anterior montou.
// Textos (.LAJ, .COL, .PIP, .PIL, .REP, .RLP) são lidos em windows-1252, como o SISTRUT
// gravou; os binários (.VIG, .SEC, .FOR, .TAB, .DSP, .INI) vão como bytes.
import { importarLaj } from "../armazenamento/sistrut/laje";
import { importarPilaresSistrut, type RepPilarSistrut } from "../armazenamento/sistrut/pilar";
import { importarVigasSistrut } from "../armazenamento/sistrut/viga";
import type { Obra } from "../dominio/obra";

export interface ArquivoEntrada {
  nome: string;
  dados: Uint8Array;
}

export type ResultadoImportacaoSistrut =
  | { ok: true; obra: Obra; avisos: string[] }
  | { ok: false; erros: string[] };

const TEXTO = new Set(["LAJ", "COL", "PIP", "PIL", "REP", "RLP"]);
/** Pilares: .COL é obrigatório quando algum deles aparece. */
const PILARES = ["COL", "PIP", "PIL", "REP", "RLP"];
const VIGAS = new Set(["VIG", "SEC", "FOR", "TAB", "DSP", "INI"]);
const DECODIFICADOR = new TextDecoder("windows-1252");

/** Extensão em maiúsculas, sem o ponto; "" quando o nome não tem extensão. */
function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toUpperCase();
}

/** Nome sem extensão, em maiúsculas: usado para casar .REP com .RLP e .SEC com .VIG. */
function baseDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return (i < 0 ? nome : nome.slice(0, i)).toUpperCase();
}

/** Ordem por nome, para a saída não depender da ordem em que o usuário selecionou. */
function porNome(a: ArquivoEntrada, b: ArquivoEntrada): number {
  return a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0;
}

/** Agrupa por extensão. Extensão desconhecida vira aviso e fica de fora. */
function agrupar(
  arquivos: readonly ArquivoEntrada[],
  avisos: string[],
): Map<string, ArquivoEntrada[]> {
  const grupos = new Map<string, ArquivoEntrada[]>();
  for (const arq of arquivos) {
    const ext = extensaoDe(arq.nome);
    if (!TEXTO.has(ext) && !VIGAS.has(ext)) {
      avisos.push(`${arq.nome}: extensão não reconhecida, arquivo ignorado.`);
      continue;
    }
    const lista = grupos.get(ext) ?? [];
    lista.push(arq);
    grupos.set(ext, lista);
  }
  for (const lista of grupos.values()) lista.sort(porNome);
  return grupos;
}

/** Texto do arquivo, decodificado como o SISTRUT gravou. */
const textoDe = (arq: ArquivoEntrada): string => DECODIFICADOR.decode(arq.dados);

/**
 * Monta uma obra a partir dos arquivos de uma obra do SISTRUT. Sem .LAJ não há obra:
 * é o único erro que para tudo. Qualquer outro erro de importador para a montagem na
 * etapa em que ocorreu, e a mensagem diz de qual arquivo ou etapa veio.
 * Avisos de todas as etapas voltam numa lista só, para mostrar antes de abrir a obra.
 * A saída não depende da ordem de `arquivos`.
 */
export function importarObraSistrut(
  arquivos: readonly ArquivoEntrada[],
): ResultadoImportacaoSistrut {
  const avisos: string[] = [];
  const grupos = agrupar(arquivos, avisos);
  const lajes = grupos.get("LAJ") ?? [];
  const [laj, ...lajesExtras] = lajes;

  if (!laj) {
    return {
      ok: false,
      erros: [
        "Nenhum .LAJ entre os arquivos. A obra começa pela laje: selecione o .LAJ junto com os .VIG e o .COL.",
      ],
    };
  }
  if (lajesExtras.length > 0) {
    const nomes = lajes.map((a) => a.nome).join(", ");
    return {
      ok: false,
      erros: [`Mais de um .LAJ selecionado (${nomes}). Selecione os arquivos de uma obra só.`],
    };
  }

  // 1. Lajes: cria a obra.
  const lida = importarLaj(textoDe(laj));
  if (!lida.ok) {
    return { ok: false, erros: lida.erros.map((e) => `${laj.nome}: ${e}`) };
  }
  avisos.push(...lida.avisos.map((a) => `${laj.nome}: ${a}`));
  let obra: Obra = lida.obra;

  // 2. Vigas: entram no pavimento de topo, com os .SEC/.FOR/.TAB/.DSP/.INI.
  const familiaVigas = [...VIGAS].flatMap((ext) => grupos.get(ext) ?? []).sort(porNome);
  if (familiaVigas.length > 0) {
    const vigas = importarVigasSistrut(familiaVigas, obra, obra.pavimentos[0]?.id);
    if (!vigas.ok) return { ok: false, erros: vigas.erros.map((e) => `Vigas: ${e}`) };
    avisos.push(...vigas.avisos);
    obra = vigas.obra;
  }

  // 3. Pilares: completam a obra. O .REP é a carga dos pilares, então com .REP as cargas
  // do .COL ficam de fora. Cada .REP ganha o próprio nível (1, 2, ...) na ordem do nome.
  if (PILARES.some((e) => grupos.has(e))) {
    const [col, colExtra] = grupos.get("COL") ?? [];
    if (!col || colExtra) {
      return {
        ok: false,
        erros: [
          colExtra
            ? "Mais de um .COL selecionado. Selecione só o .COL da obra."
            : "Há arquivos de pilar (.PIP, .PIL, .REP ou .RLP) sem o .COL. Selecione o .COL junto.",
        ],
      };
    }

    const [pip, pipExtra] = grupos.get("PIP") ?? [];
    const [pil, pilExtra] = grupos.get("PIL") ?? [];
    if (pipExtra || pilExtra) {
      return { ok: false, erros: ["Mais de um .PIP ou .PIL selecionado. Selecione um de cada."] };
    }

    const repArqs = grupos.get("REP") ?? [];
    const rlps = grupos.get("RLP") ?? [];
    for (const r of rlps) {
      if (!repArqs.some((rep) => baseDe(rep.nome) === baseDe(r.nome))) {
        avisos.push(`${r.nome}: sem .REP de mesmo nome, arquivo ignorado.`);
      }
    }
    const reps: RepPilarSistrut[] = repArqs.map((rep, i) => {
      const rlp = rlps.find((r) => baseDe(r.nome) === baseDe(rep.nome));
      return {
        texto: textoDe(rep),
        nivelInicial: i + 1,
        nivelFinal: i + 1,
        ...(rlp ? { rlp: textoDe(rlp) } : {}),
      };
    });

    const pilares = importarPilaresSistrut(
      {
        col: textoDe(col),
        ...(pip ? { pip: textoDe(pip) } : {}),
        ...(pil ? { pil: textoDe(pil) } : {}),
        ...(reps.length > 0 ? { reps } : {}),
      },
      { base: obra, cargas: reps.length > 0 },
    );
    if ("erros" in pilares) return { ok: false, erros: pilares.erros.map((e) => `Pilares: ${e}`) };
    avisos.push(...pilares.avisos);
    obra = pilares.obra;
  }

  return { ok: true, obra, avisos };
}
