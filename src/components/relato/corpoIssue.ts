// Monta o título e o corpo (markdown) da issue do relato e a URL de "nova issue" do
// GitHub (caminho sem relay). A URL tem limite de tamanho: o GitHub recusa links muito
// longos, então os erros mais antigos saem primeiro e, se ainda faltar espaço, os textos
// do usuário são cortados com aviso. A obra e o print nunca vão na URL.
import type { Diagnostico } from "./diagnostico";

export const REPOSITORIO = "gmunaro/openstrut";
/** Folga abaixo dos ~8 KB que o GitHub aceita na URL de nova issue. */
export const LIMITE_URL = 7500;
const LIMITE_TITULO = 80;
export const AVISO_CORTE = "… [texto cortado pelo limite do link; complete aqui]";

export interface TextoRelato {
  aconteceu: string;
  esperado: string;
  email: string;
}

/** Anexos citados no corpo: nomes dos arquivos e onde eles estão. `github`: o usuário
 *  cola o print e arrasta a obra na página da issue; `arquivo`: estão no zip do relato. */
export interface AnexosCorpo {
  destino: "github" | "arquivo";
  print: string | null;
  obra: string | null;
}

/** Corta por caractere (code point), sem partir emoji nem par substituto. */
export function cortar(texto: string, max: number, sufixo = "…") {
  const cps = Array.from(texto);
  return cps.length <= max ? texto : cps.slice(0, Math.max(0, max)).join("") + sufixo;
}

/** `[Relato] ` + a primeira linha do que aconteceu, curta. */
export function tituloRelato(aconteceu: string) {
  const linha = aconteceu.trim().split(/\r?\n/)[0]?.trim() ?? "";
  return `[Relato] ${linha ? cortar(linha, LIMITE_TITULO) : "problema no app"}`;
}

const celula = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** Bloco de código com cerca maior que qualquer sequência de crases do texto. */
function blocoCodigo(texto: string) {
  const maior = Math.max(2, ...Array.from(texto.matchAll(/`+/g), (m) => m[0].length));
  const cerca = "`".repeat(maior + 1);
  return `${cerca}text\n${texto}\n${cerca}`;
}

function textoPrint(a: AnexosCorpo) {
  if (!a.print) return "_O usuário não anexou o print._";
  return a.destino === "github"
    ? `**Cole o print aqui (Ctrl+V).** Ele está na área de transferência e foi baixado como \`${a.print}\`; se não colar, arraste o arquivo para esta caixa.`
    : `No arquivo do relato: \`${a.print}\`.`;
}

function textoObra(obra: string, destino: AnexosCorpo["destino"]) {
  return destino === "github"
    ? `Arraste para esta caixa o arquivo \`${obra}\`, baixado agora.`
    : `No arquivo do relato: \`${obra}\`.`;
}

/** Corpo em markdown. `erros` limita quantos erros entram (os mais novos ficam). */
export function corpoRelato(
  t: TextoRelato,
  d: Diagnostico,
  a: AnexosCorpo,
  erros = d.erros.length,
): string {
  const partes = [
    "### O que aconteceu",
    t.aconteceu.trim() || "_não informado_",
    "### O que esperava",
    t.esperado.trim() || "_não informado_",
    "### Print da tela",
    textoPrint(a),
  ];
  if (a.obra) partes.push("### Obra", textoObra(a.obra, a.destino));
  if (t.email.trim()) partes.push("### Contato", t.email.trim());
  partes.push(
    "### Diagnóstico",
    [
      "| Campo | Valor |",
      "|---|---|",
      ...d.itens.map((i) => `| ${i.rotulo} | ${celula(i.valor)} |`),
    ].join("\n"),
  );
  const ultimos = erros > 0 ? d.erros.slice(-erros) : [];
  const fora = d.erros.length - ultimos.length;
  if (ultimos.length > 0) {
    partes.push(
      `<details><summary>Últimos erros do console (${ultimos.length})</summary>\n\n${blocoCodigo(ultimos.join("\n\n"))}\n\n</details>`,
    );
  }
  if (fora > 0)
    partes.push(`_${fora} erro(s) mais antigo(s) ficaram de fora pelo limite do link._`);
  if (d.erros.length === 0) partes.push("_Nenhum erro registrado no console._");
  partes.push("---", '_Relato enviado pelo botão "Relatar problema" do OpenStrut._');
  return partes.join("\n\n");
}

/** URL de nova issue no GitHub com título, corpo e label `bug`. */
export function urlIssue(titulo: string, corpo: string) {
  const q = new URLSearchParams({ title: titulo, body: corpo, labels: "bug" });
  return `https://github.com/${REPOSITORIO}/issues/new?${q.toString()}`;
}

/** URL de nova issue que cabe em `limite`: tira erros antigos e, se preciso, corta os
 *  textos. `cortado` diz se algo ficou de fora. */
export function urlNovaIssue(t: TextoRelato, d: Diagnostico, a: AnexosCorpo, limite = LIMITE_URL) {
  const titulo = tituloRelato(t.aconteceu);
  const montar = (texto: TextoRelato, erros: number) =>
    urlIssue(titulo, corpoRelato(texto, d, a, erros));

  for (let erros = d.erros.length; erros >= 0; erros--) {
    const url = montar(t, erros);
    if (url.length <= limite) return { url, cortado: erros < d.erros.length };
  }
  // sem erros e ainda grande: corta os dois textos no mesmo tamanho, pela busca binária
  const cortados = (max: number): TextoRelato => ({
    ...t,
    aconteceu: cortar(t.aconteceu.trim(), max, AVISO_CORTE),
    esperado: cortar(t.esperado.trim(), max, AVISO_CORTE),
  });
  let lo = 0;
  let hi = Math.max(Array.from(t.aconteceu).length, Array.from(t.esperado).length);
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    if (montar(cortados(meio), 0).length <= limite) lo = meio;
    else hi = meio - 1;
  }
  const url = montar(cortados(lo), 0);
  if (url.length > limite) throw new Error("diagnóstico sozinho passa do limite do link");
  return { url, cortado: true };
}
