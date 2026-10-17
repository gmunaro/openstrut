// Importação de tabela de preços: CSV ou XLSX do usuário (colunas código, descrição,
// unidade e preço) e a planilha de insumos da SINAPI (mesmas colunas, com o preço numa
// coluna por UF). O cabeçalho é achado nas primeiras linhas pelos nomes das colunas.
import type { ItemPreco, TabelaPrecos } from "../../dominio/orcamento";
import { abrirXlsx, deszipar, lerCsv, type Aba, type Celula } from "./planilha";

const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

/** Minúsculas, sem acento e sem espaço repetido. */
const normal = (c: Celula) =>
  String(c ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Número de célula: número, "1.234,56", "1234,56", "1234.56"; vazio ou "-" = null. */
export function numeroCelula(c: Celula): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (c === null) return null;
  let s = c.replace(/R\$|\s/g, "");
  if (s === "" || s === "-") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

interface Colunas {
  linha: number;
  codigo: number;
  descricao: number;
  unidade: number;
  /** Coluna do preço; com colunas por UF, a da UF escolhida. */
  preco: number;
  /** UFs que têm coluna própria (planilha da SINAPI). */
  ufs: string[];
}

/** Acha a linha de cabeçalho e as colunas (nas primeiras 40 linhas). */
function acharColunas(linhas: readonly Celula[][], uf: string): Colunas | string {
  for (let i = 0; i < Math.min(40, linhas.length); i++) {
    const h = (linhas[i] ?? []).map(normal);
    const acha = (f: (x: string) => boolean) => h.findIndex(f);
    const codigo = acha((x) => x.startsWith("codigo") || x === "cod" || x === "cod.");
    const descricao = acha((x) => x.startsWith("descricao"));
    if (codigo < 0 || descricao < 0) continue;
    const unidade = acha((x) => x.startsWith("unid") || x === "un" || x === "und");
    const ehPreco = (x: string) => /^(preco|custo|valor)/.test(x);
    // preço por UF: a sigla no cabeçalho (insumos da SINAPI) ou na linha de cima, sobre
    // uma coluna de custo (composições da SINAPI: "Custo (R$)" repetido sob cada UF)
    const acima = (linhas[i - 1] ?? []).map(normal);
    const colunaUf = new Map<string, number>();
    for (const u of UFS) {
      const k = h.indexOf(u.toLowerCase());
      const j = acima.indexOf(u.toLowerCase());
      if (k >= 0) colunaUf.set(u, k);
      else if (j >= 0 && ehPreco(h[j] ?? "")) colunaUf.set(u, j);
    }
    const ufs = [...colunaUf.keys()];
    const preco =
      ufs.length > 0
        ? colunaUf.get(ufs.includes(uf) ? uf : ufs[0]!)!
        : acha((x) => ehPreco(x) && !x.includes("origem"));
    if (unidade < 0) return "A planilha não tem a coluna de unidade.";
    if (preco < 0) return "A planilha não tem a coluna de preço (ou de preço por UF).";
    return { linha: i, codigo, descricao, unidade, preco, ufs };
  }
  return "Não achei o cabeçalho com as colunas código, descrição, unidade e preço nas primeiras 40 linhas.";
}

export type Importacao =
  | { ok: true; itens: ItemPreco[]; aba: string; ufs: string[]; uf: string; ignoradas: number }
  | { ok: false; erro: string };

/** Itens de uma aba. `uf` escolhe a coluna de preço quando há uma por UF. */
export function itensDaAba(aba: Aba, uf = "SP"): Importacao {
  const col = acharColunas(aba.linhas, uf);
  if (typeof col === "string") return { ok: false, erro: col };
  const itens: ItemPreco[] = [];
  let ignoradas = 0;
  for (const l of aba.linhas.slice(col.linha + 1)) {
    const cod = l[col.codigo];
    const codigo = typeof cod === "number" ? String(cod) : String(cod ?? "").trim();
    const descricao = String(l[col.descricao] ?? "").trim();
    if (!codigo || !descricao) {
      if (l.some((c) => c !== null && String(c).trim() !== "")) ignoradas++;
      continue;
    }
    itens.push({
      codigo,
      descricao,
      unidade: String(l[col.unidade] ?? "").trim(),
      preco: numeroCelula(l[col.preco] ?? null),
    });
  }
  if (itens.length === 0)
    return { ok: false, erro: "A planilha não tem linhas de preço abaixo do cabeçalho." };
  const ufUsada = col.ufs.length > 0 ? (col.ufs.includes(uf) ? uf : col.ufs[0]!) : "";
  return { ok: true, itens, aba: aba.nome, ufs: col.ufs, uf: ufUsada, ignoradas };
}

/** Mês de referência ("AAAA-MM") e desoneração da aba da SINAPI, pelo nome da aba
 *  (ISD/CSD sem, ICD/CCD com desoneração) e pela linha "Mês de Referência: MM/AAAA". */
export function metadadosSinapi(aba: Aba): { referencia: string; desonerado: boolean | null } {
  let referencia = "";
  for (const l of aba.linhas.slice(0, 10)) {
    const i = l.findIndex((c) => normal(c).startsWith("mes de referencia"));
    const m = i >= 0 ? /(\d{2})\/(\d{4})/.exec(String(l[i + 1] ?? l[i] ?? "")) : null;
    if (m) referencia = `${m[2]}-${m[1]}`;
  }
  const n = aba.nome.toUpperCase();
  const desonerado = /^(ISD|CSD)$/.test(n) ? false : /^(ICD|CCD)$/.test(n) ? true : null;
  return { referencia, desonerado };
}

/** Planilha aberta: os nomes das abas e a leitura de uma (CSV: uma aba só). */
export interface Planilha {
  nomes: string[];
  ler(nome: string): Promise<Aba>;
}

/** Abre o arquivo do usuário pela extensão: CSV, XLSX ou o ZIP mensal da SINAPI (lê a
 *  planilha de referência de dentro dele). */
export async function abrirPlanilha(nome: string, dados: Uint8Array): Promise<Planilha> {
  if (/\.xlsx$/i.test(nome)) return abrirXlsx(dados);
  if (/\.zip$/i.test(nome)) {
    const xlsx = await deszipar(dados, (n) => /\.xlsx$/i.test(n));
    const nomes = [...xlsx.keys()];
    const ref = nomes.find((n) => /refer/i.test(n)) ?? nomes[0];
    if (!ref) throw new Error("O ZIP não tem planilha .xlsx.");
    return abrirXlsx(xlsx.get(ref)!);
  }
  if (/\.(csv|txt)$/i.test(nome)) {
    // UTF-8; se não decodifica, latin1 (CSV salvo pelo Excel em Windows)
    let texto: string;
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(dados);
    } catch {
      texto = new TextDecoder("latin1").decode(dados);
    }
    const aba = { nome, linhas: lerCsv(texto) };
    return { nomes: [nome], ler: async () => aba };
  }
  throw new Error(
    "Formato não suportado: use .csv, .xlsx ou o .zip da SINAPI (o .xls antigo não é lido; salve como .xlsx).",
  );
}

/** Tabela nova a partir de uma importação. */
export const tabelaImportada = (
  nomeArquivo: string,
  imp: Extract<Importacao, { ok: true }>,
  extra: Partial<Pick<TabelaPrecos, "referencia" | "desonerado">> = {},
): TabelaPrecos => ({
  id: crypto.randomUUID(),
  nome: `${nomeArquivo.replace(/\.[^.]+$/, "")} · ${imp.aba}${imp.uf ? ` · ${imp.uf}` : ""}`,
  fonte: `Importada de ${nomeArquivo} (aba ${imp.aba}${imp.uf ? `, preços de ${imp.uf}` : ""})`,
  referencia: extra.referencia ?? "",
  uf: imp.uf,
  desonerado: extra.desonerado ?? null,
  itens: imp.itens,
});

/** Junta itens numa tabela: o código que já existe recebe a descrição, a unidade e o
 *  preço novos; os outros entram no fim. */
export function juntarItens(tabela: TabelaPrecos, itens: readonly ItemPreco[]): TabelaPrecos {
  const novos = new Map(itens.map((i) => [i.codigo, i]));
  const atualizados = tabela.itens.map((i) => novos.get(i.codigo) ?? i);
  const existentes = new Set(tabela.itens.map((i) => i.codigo));
  return { ...tabela, itens: [...atualizados, ...itens.filter((i) => !existentes.has(i.codigo))] };
}
