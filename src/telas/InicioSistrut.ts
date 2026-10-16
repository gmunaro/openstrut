// Importação de uma obra a partir dos arquivos do SISTRUT escolhidos de uma vez.
// Cada arquivo é classificado pela extensão e casado pelo nome-base: cada .LAJ é um
// pavimento, e o .VIG/.SEC/.FOR/.TAB de mesmo nome são as vigas dele. A obra sai na
// ordem .LAJ → vigas → pilares, e cada importador (laje.ts, viga.ts, pilar.ts) recebe o
// que o anterior montou.
//
// Vários pavimentos: o original guarda cada pavimento numa obra do LAJE/VIGA com o
// nome dele (COB.LAJ, SUP.LAJ...), e o .COL do PILGEEDI tem os níveis do prédio com nome
// e cota. O .REP de cada pavimento entra no nível que o usuário escolhe "pelo número ou
// pelo nome" (PILGEEDI.BAS:482-503), e o .COL guarda o nome de cada nível: o pavimento
// é o nível do .COL com o nome do .LAJ, e a ordem e o pé-direito saem das cotas.
//
// Textos (.LAJ, .COL, .PIP, .PIL, .REP, .RLP) são lidos em windows-1252, como o SISTRUT
// gravou; os binários (.VIG, .SEC, .FOR, .TAB, .DSP, .INI) vão como bytes.
import { lerObra, serializarObra } from "../armazenamento/arquivo";
import { importarLaj } from "../armazenamento/sistrut/laje";
import { explicarErros, type OrigemPavimento } from "../armazenamento/sistrut/mensagens";
import {
  importarPilaresSistrut,
  lerCol,
  type NivelCol,
  type RepPilarSistrut,
} from "../armazenamento/sistrut/pilar";
import { importarVigasSistrut, lerVig } from "../armazenamento/sistrut/viga";
import type { Obra, Pavimento } from "../dominio/obra";

export interface ArquivoEntrada {
  nome: string;
  dados: Uint8Array;
}

export type ResultadoImportacaoSistrut =
  | { ok: true; obra: Obra; avisos: string[] }
  | { ok: false; erros: string[] };

const TEXTO = new Set(["LAJ", "COL", "PIP", "PIL", "REP", "RLP"]);
const VIGAS = new Set(["VIG", "SEC", "FOR", "TAB", "DSP", "INI"]);
/** Da obra inteira, não de um pavimento: entram em todas as chamadas do importador de vigas. */
const VIGAS_DA_OBRA = new Set(["DSP", "INI"]);
/** Arquivos do SISTRUT que a importação não lê, com o motivo. */
const NAO_LIDOS: Record<string, string> = {
  BAK: "cópia de segurança do .LAJ anterior, que o LAJEGRAV guarda ao gravar (LAJEGRAV.BAS:484); não usada.",
  EDV: "desenho de armadura editado de uma viga, do DESEDCAO; não importado.",
};
const DECODIFICADOR = new TextDecoder("windows-1252");

/** Extensão em maiúsculas, sem o ponto; "" quando o nome não tem extensão. */
function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toUpperCase();
}

/** Nome sem extensão nem pasta, em maiúsculas: casa o .VIG e o .REP com o .LAJ. */
function baseDe(nome: string): string {
  const semPasta = nome.replace(/^.*[\\/]/, "");
  const i = semPasta.lastIndexOf(".");
  return (i < 0 ? semPasta : semPasta.slice(0, i)).trim().toUpperCase();
}

/** Ordem por nome, para a saída não depender da ordem em que o usuário selecionou. */
function porNome(a: ArquivoEntrada, b: ArquivoEntrada): number {
  return a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0;
}

/** Agrupa por extensão. Extensão que a importação não lê vira aviso e fica de fora. */
function agrupar(
  arquivos: readonly ArquivoEntrada[],
  avisos: string[],
): Map<string, ArquivoEntrada[]> {
  const grupos = new Map<string, ArquivoEntrada[]>();
  for (const arq of [...arquivos].sort(porNome)) {
    const ext = extensaoDe(arq.nome);
    const motivo = NAO_LIDOS[ext];
    if (motivo) {
      avisos.push(`${arq.nome}: ${motivo}`);
      continue;
    }
    if (!TEXTO.has(ext) && !VIGAS.has(ext)) {
      avisos.push(`${arq.nome}: extensão não reconhecida, arquivo ignorado.`);
      continue;
    }
    const lista = grupos.get(ext) ?? [];
    lista.push(arq);
    grupos.set(ext, lista);
  }
  return grupos;
}

/** Texto do arquivo, decodificado como o SISTRUT gravou. */
const textoDe = (arq: ArquivoEntrada): string => DECODIFICADOR.decode(arq.dados);

/** Põe o nome do arquivo na frente da mensagem, se ela ainda não começa por ele. */
const comArquivo = (nome: string, msg: string) =>
  msg.toUpperCase().startsWith(nome.toUpperCase()) ? msg : `${nome}: ${msg}`;

const fmt = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

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
  if (pavs.length > 1 || semNivel.length > 0) {
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
    if (pavs.length > 1 || niveis)
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

/** Vigas que não são de pavimento nenhum (.VIG sem .LAJ de mesmo nome, como uma escada
 *  calculada à parte no VIGA): a obra só de vigas do importador vira um pavimento à
 *  parte, no topo. Cada apoio tem um pilar só para a viga ficar de pé na planta: a
 *  reação não vai a pilar nenhum (apoio desconsiderado) e o pilar é marcado como sobre
 *  viga de transição, para não pesar no prédio. */
function pavimentoDeVigasAvulsas(
  base: string,
  arquivos: readonly ArquivoEntrada[],
  avisos: string[],
): Pavimento | undefined {
  const r = importarVigasSistrut(arquivos);
  const vig = `${base}.VIG`;
  if (!r.ok) {
    avisos.push(
      ...r.erros.map((e) => comArquivo(vig, `${e} As vigas deste arquivo ficaram de fora.`)),
    );
    return undefined;
  }
  const [pav] = r.obra.pavimentos;
  if (!pav) return undefined;
  avisos.push(...r.avisos.map((a) => comArquivo(vig, a)));
  const apoiosEmViga: string[] = [];
  for (const v of pav.vigas) {
    const n = (v.vaos?.length ?? 1) + 1;
    v.apoiosDesconsiderados = Array.from({ length: n }, (_, k) => k);
    const titulos = (v.forma?.apoios ?? []).flatMap((a) =>
      a.tipo === "V" && a.titulo ? [a.titulo] : [],
    );
    if (titulos.length > 0) apoiosEmViga.push(`${v.nome} em ${titulos.join(" e ")}`);
  }
  avisos.push(
    `${vig}: não há ${base}.LAJ e o .VIG não diz de que pavimento são as vigas ${pav.vigas.map((v) => v.nome).join(", ")}. Elas entraram como vigas avulsas, no pavimento "${base}" no topo da obra, fora da planta do prédio, cada uma com um apoio em cada ponta; a reação não vai a pilar nem a viga nenhuma${apoiosEmViga.length > 0 ? ` (pelo .FOR, ${apoiosEmViga.join("; ")})` : ""}. Se a escada carrega o prédio, lance as reações como carga nas vigas de apoio.`,
  );
  return {
    ...pav,
    id: base,
    nome: base,
    pilares: pav.pilares.map((p) => ({ ...p, transicao: true as const })),
  };
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

/** Desce o pavimento de vigas avulsas para `ENTRE_PLANTAS` abaixo de `limite`: o motor
 *  liga pilares de níveis diferentes pela posição, e os pilares inventados para os
 *  apoios não podem cair em cima de um pilar do prédio. */
const ENTRE_PLANTAS = 5;
function abaixoDe(pav: Pavimento, limite: number): Pavimento {
  const ys = [...pav.vigas.flatMap((v) => [v.y1, v.y2]), ...pav.pilares.map((q) => q.y)];
  const dy = limite - ENTRE_PLANTAS - Math.max(...ys);
  const desce = (y: number) => Math.round((y + dy) * 1e6) / 1e6;
  return {
    ...pav,
    vigas: pav.vigas.map((v) => ({ ...v, y1: desce(v.y1), y2: desce(v.y2) })),
    pilares: pav.pilares.map((q) => ({ ...q, y: desce(q.y) })),
  };
}

/**
 * Monta uma obra a partir dos arquivos de uma obra do SISTRUT. Sem .LAJ não há obra.
 * Cada .LAJ vira um pavimento. Um erro num .LAJ, nas vigas de um pavimento ou nos
 * pilares para a montagem, e a mensagem diz o arquivo, o item e o que fazer; as vigas
 * avulsas que não abrem só geram aviso. Avisos de todas as etapas voltam numa lista só,
 * para mostrar antes de abrir a obra. A saída não depende da ordem de `arquivos`.
 */
export function importarObraSistrut(
  arquivos: readonly ArquivoEntrada[],
): ResultadoImportacaoSistrut {
  const avisos: string[] = [];
  const grupos = agrupar(arquivos, avisos);
  const lajes = grupos.get("LAJ") ?? [];
  if (lajes.length === 0)
    return {
      ok: false,
      erros: [
        "Nenhum .LAJ entre os arquivos. A obra começa pela laje: selecione o .LAJ de cada pavimento junto com os .VIG e o .COL.",
      ],
    };
  const cols = grupos.get("COL") ?? [];
  if (cols.length > 1)
    return {
      ok: false,
      erros: [
        `Mais de um .COL selecionado (${cols.map((c) => c.nome).join(", ")}). O .COL é do prédio inteiro: selecione só um.`,
      ],
    };
  const [col] = cols;
  // níveis do .COL (nome e cota); um .COL ilegível dá erro adiante, no importador de pilares
  const colLido = col ? lerCol(textoDe(col)) : undefined;
  const niveis = colLido?.ok ? colLido.valor.niveis : undefined;

  // 1. Lajes: um pavimento por .LAJ, na ordem do prédio.
  const pavs = ordenarPavimentos(lajes, niveis, avisos);
  const comNivel = pavs.some((p) => p.nivel !== undefined);
  const nPavs = pavs.length;
  const vigs = grupos.get("VIG") ?? [];
  let obra: Obra | undefined;
  for (const [i, p] of pavs.entries()) {
    const registrosVig = registrosDoVig(vigs.find((v) => baseDe(v.nome) === p.base));
    // nível: o do nome; sem nenhum casado, de baixo para cima (o de baixo é o nível 2)
    const nivel = comNivel ? p.nivel : niveis ? nPavs - i + 1 : undefined;
    const peDireito = nivel !== undefined && niveis ? peDireitoDoNivel(niveis, nivel) : undefined;
    const lida = importarLaj(
      textoDe(p.laj),
      {
        pavimento: { id: p.base, nome: p.base },
        ...(peDireito ? { peDireito } : {}),
        ...(registrosVig ? { registrosVig } : {}),
      },
      p.laj.nome,
    );
    if (!lida.ok) return { ok: false, erros: lida.erros.map((e) => comArquivo(p.laj.nome, e)) };
    avisos.push(...lida.avisos.map((a) => comArquivo(p.laj.nome, a)));
    if (!obra) obra = lida.obra;
    else obra = { ...obra, pavimentos: [...obra.pavimentos, ...lida.obra.pavimentos] };
  }
  if (!obra) return { ok: false, erros: ["Nenhum pavimento importado."] };
  if (colLido?.ok && colLido.valor.obra) obra.nome = colLido.valor.obra;

  // 2. Vigas: as do .VIG de mesmo nome entram no pavimento; o .DSP e os .INI valem para todos.
  const familia = [...VIGAS].flatMap((ext) => grupos.get(ext) ?? []);
  const daObra = familia.filter((a) => VIGAS_DA_OBRA.has(extensaoDe(a.nome)));
  const bases = new Set(pavs.map((p) => p.base));
  for (const p of pavs) {
    const doPav = familia.filter(
      (a) => !VIGAS_DA_OBRA.has(extensaoDe(a.nome)) && baseDe(a.nome) === p.base,
    );
    if (doPav.length === 0) continue;
    const vig = `${p.base}.VIG`;
    if (!doPav.some((a) => extensaoDe(a.nome) === "VIG")) {
      avisos.push(
        `${doPav.map((a) => a.nome).join(", ")}: sem o ${vig}, que é a entrada das vigas; ${doPav.length > 1 ? "ignorados" : "ignorado"}.`,
      );
      continue;
    }
    const vigas = importarVigasSistrut([...doPav, ...daObra], obra, p.base);
    if (!vigas.ok) return { ok: false, erros: vigas.erros.map((e) => comArquivo(vig, e)) };
    avisos.push(...vigas.avisos.map((a) => comArquivo(vig, a)));
    obra = vigas.obra;
  }

  // vigas avulsas: .VIG sem .LAJ de mesmo nome (os .INI e o .DSP são da obra)
  const avulsas = new Map<string, ArquivoEntrada[]>();
  for (const a of familia) {
    const b = baseDe(a.nome);
    if (VIGAS_DA_OBRA.has(extensaoDe(a.nome)) || bases.has(b)) continue;
    avulsas.set(b, [...(avulsas.get(b) ?? []), a]);
  }
  const pavimentosAvulsos: Pavimento[] = [];
  for (const [b, arqs] of avulsas) {
    if (!arqs.some((a) => extensaoDe(a.nome) === "VIG")) {
      avisos.push(
        `${arqs.map((a) => a.nome).join(", ")}: sem ${b}.VIG nem ${b}.LAJ; ${arqs.length > 1 ? "ignorados" : "ignorado"}.`,
      );
      continue;
    }
    const pav = pavimentoDeVigasAvulsas(b, [...arqs, ...daObra], avisos);
    if (pav) pavimentosAvulsos.push(pav);
  }

  // 3. Pilares: o .COL liga cada pavimento a um nível. O .REP de um pavimento importado é
  // o que o motor recalcula pelas vigas dele: entrar com ele somaria a carga duas vezes
  // (`Pilar.cargaTopo` soma com o .REP do pavimento). Um .REP de outra obra entra como
  // carga no nível do .COL de mesmo nome, como o PILGEEDI o leria.
  const repArqs = grupos.get("REP") ?? [];
  const rlps = grupos.get("RLP") ?? [];
  const doPavimento = repArqs.filter((r) => bases.has(baseDe(r.nome)));
  if (doPavimento.length > 0)
    avisos.push(
      `${doPavimento.map((r) => r.nome).join(", ")}: reações das vigas nos pilares, que o motor recalcula pelas vigas de cada pavimento; não entram como carga, para não contar duas vezes.`,
    );
  for (const r of rlps)
    if (!repArqs.some((rep) => baseDe(rep.nome) === baseDe(r.nome)))
      avisos.push(`${r.nome}: sem .REP de mesmo nome, arquivo ignorado.`);
  const reps: RepPilarSistrut[] = [];
  for (const rep of repArqs) {
    if (bases.has(baseDe(rep.nome))) continue;
    const k = niveis?.findIndex((n) => n.nome.trim().toUpperCase() === baseDe(rep.nome)) ?? -1;
    if (k < 0) {
      avisos.push(
        `${rep.nome}: não há pavimento nem nível do .COL chamado ${baseDe(rep.nome)}; as cargas não foram importadas. Lance-as como carga no topo dos pilares do nível certo.`,
      );
      continue;
    }
    const rlp = rlps.find((r) => baseDe(r.nome) === baseDe(rep.nome));
    reps.push({
      texto: textoDe(rep),
      nivelInicial: k + 1,
      nivelFinal: k + 1,
      ...(rlp ? { rlp: textoDe(rlp) } : {}),
    });
  }
  const pips = grupos.get("PIP") ?? [];
  const pils = grupos.get("PIL") ?? [];
  if (!col) {
    const soltos = [...pips, ...pils];
    if (soltos.length > 0)
      avisos.push(
        `${soltos.map((a) => a.nome).join(", ")}: sem o .COL, que tem os pilares do prédio; ${soltos.length > 1 ? "ignorados" : "ignorado"}.`,
      );
  } else {
    if (pips.length > 1 || pils.length > 1)
      return { ok: false, erros: ["Mais de um .PIP ou .PIL selecionado. Selecione um de cada."] };
    const [pip] = pips;
    const [pil] = pils;
    const niveisDosPavimentos = comNivel
      ? Object.fromEntries(pavs.flatMap((p) => (p.nivel !== undefined ? [[p.base, p.nivel]] : [])))
      : undefined;
    const pilares = importarPilaresSistrut(
      {
        col: textoDe(col),
        ...(pip ? { pip: textoDe(pip) } : {}),
        ...(pil ? { pil: textoDe(pil) } : {}),
        ...(reps.length > 0 ? { reps } : {}),
      },
      {
        base: obra,
        cargas: reps.length > 0,
        ...(niveisDosPavimentos ? { niveis: niveisDosPavimentos } : {}),
      },
    );
    if ("erros" in pilares)
      return { ok: false, erros: pilares.erros.map((e) => comArquivo(col.nome, e)) };
    avisos.push(...pilares.avisos);
    obra = pilares.obra;
  }
  for (const pav of pavimentosAvulsos)
    obra = { ...obra, pavimentos: [abaixoDe(pav, menorY(obra.pavimentos)), ...obra.pavimentos] };

  // a obra inteira passa pela validação de um arquivo aberto
  const lida = lerObra(serializarObra(obra));
  if (!lida.ok) {
    const final = obra;
    const origem = (i: number): OrigemPavimento => {
      const b = final.pavimentos[i]?.id ?? "";
      const tem = (ext: string) =>
        arquivos.some((a) => baseDe(a.nome) === b && extensaoDe(a.nome) === ext);
      return {
        ...(tem("LAJ") ? { laj: `${b}.LAJ` } : {}),
        ...(tem("VIG") ? { vig: `${b}.VIG` } : {}),
        ...(col ? { col: col.nome } : {}),
      };
    };
    return { ok: false, erros: explicarErros(lida.erros, obra, origem) };
  }
  return { ok: true, obra: lida.obra, avisos };
}
