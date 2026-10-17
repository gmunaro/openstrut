// Planilhas sem dependência: CSV (pt-BR, ";" e vírgula decimal) e XLSX mínimo.
// - gravar: zip sem compressão (STORE) com o XML do Office Open XML, uma aba por
//   tabela, células numéricas e texto inline (sem sharedStrings);
// - ler: zip STORE ou DEFLATE (DecompressionStream "deflate-raw", nativo no
//   navegador e no Node), workbook, sharedStrings e células por regex. Lê valores,
//   não fórmulas nem formatação: o suficiente para uma tabela de preços.
// Formato zip: APPNOTE.TXT (PKWARE), cabeçalho local, diretório central e fim.

/** Célula: texto, número ou vazia. */
export type Celula = string | number | null;
export interface Aba {
  nome: string;
  linhas: Celula[][];
}

// ---- CSV ----------------------------------------------------------------------------

/** Número com vírgula decimal, como o Excel em pt-BR abre (sem separador de milhar). */
const numeroCsv = (n: number) => (Number.isFinite(n) ? String(n).replace(".", ",") : "");

const campoCsv = (c: Celula) => {
  if (c === null) return "";
  if (typeof c === "number") return numeroCsv(c);
  return /[;"\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
};

/** CSV com ";" e BOM (o Excel em pt-BR reconhece o UTF-8 e as colunas). */
export const gerarCsv = (linhas: readonly Celula[][]) =>
  `﻿${linhas.map((l) => l.map(campoCsv).join(";")).join("\r\n")}\r\n`;

/** Lê CSV: separador ";", "," ou tab (o que mais aparece na primeira linha), aspas. */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/, 1)[0] ?? "";
  const conta = (s: string) => primeira.split(s).length;
  const sep = [";", "\t", ","].reduce((a, b) => (conta(b) > conta(a) ? b : a));
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

// ---- zip ----------------------------------------------------------------------------

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (o do zip): crc32("123456789") = 0xCBF43926. */
export function crc32(d: Uint8Array) {
  let c = 0xffffffff;
  for (const b of d) c = TABELA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip sem compressão. Nomes em UTF-8 (bit 11). */
export function zipar(arquivos: readonly { nome: string; dados: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new Uint8Array(30 + nome.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);
    v.setUint16(8, 0, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, a.dados.length, true);
    v.setUint32(22, a.dados.length, true);
    v.setUint16(26, nome.length, true);
    local.set(nome, 30);
    const cd = new Uint8Array(46 + nome.length);
    const w = new DataView(cd.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, a.dados.length, true);
    w.setUint32(24, a.dados.length, true);
    w.setUint16(28, nome.length, true);
    w.setUint32(42, offset, true);
    cd.set(nome, 46);
    partes.push(local, a.dados);
    central.push(cd);
    offset += local.length + a.dados.length;
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, offset, true);
  const total = new Uint8Array(offset + tamCentral + 22);
  let p = 0;
  for (const x of [...partes, ...central, fim]) {
    total.set(x, p);
    p += x.length;
  }
  return total;
}

async function inflar(d: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([d as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Arquivos de um zip (STORE ou DEFLATE), pelo diretório central; com `quais`, só os
 *  que ela aceita são descompactados. */
export async function deszipar(
  dados: Uint8Array,
  quais: (nome: string) => boolean = () => true,
): Promise<Map<string, Uint8Array>> {
  const v = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);
  let fim = -1;
  for (let i = dados.length - 22; i >= Math.max(0, dados.length - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  if (fim < 0) throw new Error("O arquivo não é uma planilha XLSX (zip) válida.");
  const n = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const dec = new TextDecoder();
  const saida = new Map<string, Uint8Array>();
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("Zip corrompido.");
    const metodo = v.getUint16(p + 10, true);
    const comprimido = v.getUint32(p + 20, true);
    const lnome = v.getUint16(p + 28, true);
    const lextra = v.getUint16(p + 30, true);
    const lcom = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = dec.decode(dados.subarray(p + 46, p + 46 + lnome));
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const bruto = dados.subarray(ini, ini + comprimido);
    if (!quais(nome)) {
      p += 46 + lnome + lextra + lcom;
      continue;
    }
    if (metodo === 0) saida.set(nome, bruto);
    else if (metodo === 8) saida.set(nome, await inflar(bruto));
    // outros métodos não aparecem em XLSX; o arquivo fica de fora
    p += 46 + lnome + lextra + lcom;
  }
  return saida;
}

// ---- XLSX ---------------------------------------------------------------------------

const escXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // caracteres de controle não valem em XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const desescXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k[0] === "#")
      return String.fromCodePoint(
        k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10),
      );
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[k] ?? "";
  });

/** "A" → 0, "Z" → 25, "AA" → 26. */
const indiceColuna = (letras: string) =>
  [...letras].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const letraColuna = (i: number): string =>
  (i >= 26 ? letraColuna(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));

/** Nome de aba válido no Excel: até 31 caracteres, sem []:*?/\. */
const nomeAba = (s: string) => s.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Planilha";

function xmlAba(linhas: readonly Celula[][]) {
  const rows = linhas
    .map((l, i) => {
      const cs = l
        .map((c, j) => {
          const ref = `${letraColuna(j)}${i + 1}`;
          if (c === null || c === "") return "";
          if (typeof c === "number")
            return Number.isFinite(c) ? `<c r="${ref}"><v>${c}</v></c>` : "";
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(c)}</t></is></c>`;
        })
        .join("");
      return `<row r="${i + 1}">${cs}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

/** XLSX com uma aba por item de `abas`. */
export function gerarXlsx(abas: readonly Aba[]): Uint8Array {
  const enc = new TextEncoder();
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${abas
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const usados = new Set<string>();
  const nomes = abas.map((a) => {
    let n = nomeAba(a.nome);
    for (let k = 2; usados.has(n); k++) n = `${nomeAba(a.nome).slice(0, 28)} ${k}`;
    usados.add(n);
    return n;
  });
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes
    .map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")}</Relationships>`;
  return zipar([
    { nome: "[Content_Types].xml", dados: enc.encode(ct) },
    { nome: "_rels/.rels", dados: enc.encode(rels) },
    { nome: "xl/workbook.xml", dados: enc.encode(wb) },
    { nome: "xl/_rels/workbook.xml.rels", dados: enc.encode(wbRels) },
    ...abas.map((a, i) => ({
      nome: `xl/worksheets/sheet${i + 1}.xml`,
      dados: enc.encode(xmlAba(a.linhas)),
    })),
  ]);
}

/** Atributo `nome` de uma tag XML (o texto entre <tag ... >). */
const atributo = (tag: string, nome: string) =>
  new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(tag)?.[1];

/** Texto de um <si> ou <is>: os <t>, fora da transliteração fonética <rPh>. */
const textoRico = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((m) => desescXml(m[1]!))
    .join("");

/** XLSX aberto: os nomes das abas e a leitura de uma aba sob demanda (a planilha da
 *  SINAPI tem abas de dezenas de MB que a importação não precisa ler). */
export interface Xlsx {
  nomes: string[];
  ler(nome: string): Promise<Aba>;
}

/** Abre um XLSX: lê o workbook e as strings compartilhadas; as abas, só em `ler`. */
export async function abrirXlsx(dados: Uint8Array): Promise<Xlsx> {
  const dec = new TextDecoder();
  const base = await deszipar(
    dados,
    (n) =>
      n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml",
  );
  const texto = (n: string) => {
    const a = base.get(n);
    return a ? dec.decode(a) : undefined;
  };
  const wb = texto("xl/workbook.xml");
  if (!wb) throw new Error("O arquivo não é uma planilha XLSX (falta xl/workbook.xml).");
  const alvo = new Map<string, string>();
  for (const m of (texto("xl/_rels/workbook.xml.rels") ?? "").matchAll(
    /<Relationship\b([^>]*)\/?>/g,
  )) {
    const id = atributo(m[1]!, "Id");
    const t = atributo(m[1]!, "Target");
    if (id && t) alvo.set(id, t.startsWith("/") ? t.slice(1) : `xl/${t}`);
  }
  const compartilhadas = [
    ...(texto("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g),
  ].map((m) => textoRico(m[1]!));
  const caminho = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const rid = atributo(m[1]!, "r:id");
    const alvoAba = rid ? alvo.get(rid) : undefined;
    if (alvoAba) caminho.set(desescXml(atributo(m[1]!, "name") ?? ""), alvoAba);
  }
  return {
    nomes: [...caminho.keys()],
    async ler(nome) {
      const c = caminho.get(nome);
      const xml = c ? (await deszipar(dados, (n) => n === c)).get(c) : undefined;
      return { nome, linhas: xml ? celulasDaAba(dec.decode(xml), compartilhadas) : [] };
    },
  };
}

/** Lê todas as abas de um XLSX: valores das células (texto ou número), sem fórmulas. */
export async function lerXlsx(dados: Uint8Array): Promise<Aba[]> {
  const x = await abrirXlsx(dados);
  return Promise.all(x.nomes.map((n) => x.ler(n)));
}

function celulasDaAba(xml: string, compartilhadas: readonly string[]): Celula[][] {
  const linhas: Celula[][] = [];
  for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const nr = Number(atributo(r[1]!, "r") ?? linhas.length + 1) - 1;
    const linha: Celula[] = [];
    let col = 0;
    for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const ref = atributo(attrs, "r");
      if (ref) col = indiceColuna(/^[A-Z]+/.exec(ref)?.[0] ?? "A");
      const t = atributo(attrs, "t");
      const corpo = c[2] ?? "";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      let valor: Celula = null;
      if (t === "s") valor = v === undefined ? null : (compartilhadas[Number(v)] ?? null);
      else if (t === "inlineStr") valor = textoRico(corpo);
      else if (t === "str" || t === "e") valor = v === undefined ? null : desescXml(v);
      else if (t === "b") valor = v === "1" ? "VERDADEIRO" : "FALSO";
      else if (v !== undefined) valor = Number.isFinite(Number(v)) ? Number(v) : desescXml(v);
      // link da SINAPI: HYPERLINK(destino; código) com o valor em cache 0; vale o código
      const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(corpo)?.[1];
      const link = f ? /^HYPERLINK\(.*,\s*"?([^",()]+)"?\)$/.exec(desescXml(f).trim()) : null;
      if (link?.[1]) valor = Number.isFinite(Number(link[1])) ? Number(link[1]) : link[1];
      linha[col] = valor;
      col++;
    }
    linhas[nr] = Array.from(linha, (x) => x ?? null);
  }
  return Array.from(linhas, (l) => l ?? []);
}
