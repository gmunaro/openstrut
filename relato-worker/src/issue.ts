// Montagem do título e do corpo da issue a partir do relato validado. Funções
// puras: todo texto do usuário passa por aqui antes de virar Markdown público.
import type { ItemDiagnostico, Relato } from "./tipos";

/** Limite do GitHub para o corpo da issue é 65536 caracteres; sobra folga. */
const LIMITE_CORPO = 65_000;

const ZWSP = "​";

/** Onde os anexos ficaram no repositório de arquivos. */
export interface Anexos {
  repoArquivos: string;
  branch: string;
  id: string;
  temPrint: boolean;
  nomeObra: string | undefined;
}

/** `@nome` vira `@` + espaço de largura zero + `nome`: o GitHub não notifica ninguém. */
export function neutralizarMencoes(texto: string) {
  return texto.replace(/@(?=[A-Za-z0-9_-])/g, `@${ZWSP}`);
}

/** Texto do usuário como citação Markdown, `> ` em cada linha. */
export function citar(texto: string) {
  return neutralizarMencoes(texto)
    .split(/\r?\n/)
    .map((linha) => (linha ? `> ${linha}` : ">"))
    .join("\n");
}

/** Bloco de código cercado; corridas de 3+ crases no conteúdo são quebradas para não fechá-lo. */
export function blocoDeCodigo(texto: string) {
  const seguro = neutralizarMencoes(texto).replace(/`{3,}/g, (crases) =>
    crases.split("").join(ZWSP),
  );
  return `\`\`\`text\n${seguro}\n\`\`\``;
}

/** Célula de tabela Markdown: escapa `\` e `|` e troca quebras de linha por `<br>`. */
export function celula(texto: string) {
  return neutralizarMencoes(texto)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

export function tituloIssue(titulo: string) {
  return `[Relato] ${neutralizarMencoes(titulo)}`;
}

export function urlPrint({ repoArquivos, branch, id }: Anexos) {
  return `https://raw.githubusercontent.com/${repoArquivos}/${branch}/relatos/${id}/print.png`;
}

export function urlObra({ repoArquivos, branch, id }: Anexos, nomeObra: string) {
  return `https://github.com/${repoArquivos}/blob/${branch}/relatos/${id}/${nomeObra}`;
}

function tabelaDiagnostico(itens: ItemDiagnostico[]) {
  if (!itens.length) return "_Sem diagnóstico._";
  const linhas = itens.map(({ rotulo, valor }) => `| ${celula(rotulo)} | ${celula(valor)} |`);
  return ["| Item | Valor |", "| --- | --- |", ...linhas].join("\n");
}

/** Corpo da issue. O e-mail nunca entra: só a informação de que o autor deixou contato. */
export function corpoIssue(relato: Relato, anexos: Anexos) {
  const secoes = [
    `### O que aconteceu\n\n${citar(relato.aconteceu)}`,
    `### O que esperava\n\n${relato.esperado ? citar(relato.esperado) : "_Não informado._"}`,
  ];
  if (anexos.temPrint) secoes.push(`### Print\n\n![print](${urlPrint(anexos)})`);
  if (anexos.nomeObra) {
    secoes.push(`### Obra\n\n[${anexos.nomeObra}](${urlObra(anexos, anexos.nomeObra)})`);
  }
  secoes.push(`### Diagnóstico\n\n${tabelaDiagnostico(relato.diagnostico)}`);

  const fim = [
    relato.email
      ? "O autor deixou e-mail de contato (guardado fora da issue)."
      : "O autor não deixou e-mail de contato.",
    "---\n_Enviado pelo botão Relatar problema do OpenStrut (relay)._",
  ];

  if (relato.erros.length) {
    // Os erros são a parte mais longa; cortam-se eles para caber no limite do GitHub.
    const resto = [...secoes, ...fim].join("\n\n").length;
    const folga = LIMITE_CORPO - resto - 200;
    let erros = relato.erros.join("\n\n");
    if (erros.length > folga) erros = `${erros.slice(0, Math.max(folga, 0))}\n… (truncado)`;
    secoes.push(`### Últimos erros\n\n${blocoDeCodigo(erros)}`);
  }

  const corpo = [...secoes, ...fim].join("\n\n");
  return corpo.length > LIMITE_CORPO ? `${corpo.slice(0, LIMITE_CORPO)}\n\n… (truncado)` : corpo;
}
