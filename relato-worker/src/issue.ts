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
  /** Anexos noutro repositório (privado): link em vez da imagem embutida, que o
   *  GitHub não mostra de repositório privado. */
  separados?: boolean;
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

export function urlPrint({ repoArquivos, branch, id, separados }: Anexos) {
  return separados
    ? `https://github.com/${repoArquivos}/blob/${branch}/relatos/${id}/print.png`
    : `https://raw.githubusercontent.com/${repoArquivos}/${branch}/relatos/${id}/print.png`;
}

export function urlObra({ repoArquivos, branch, id }: Anexos, nomeObra: string) {
  return `https://github.com/${repoArquivos}/blob/${branch}/relatos/${id}/${nomeObra}`;
}

function tabelaDiagnostico(itens: ItemDiagnostico[]) {
  if (!itens.length) return "_Sem diagnóstico._";
  const linhas = itens.map(({ rotulo, valor }) => `| ${celula(rotulo)} | ${celula(valor)} |`);
  return ["| Item | Valor |", "| --- | --- |", ...linhas].join("\n");
}

/**
 * Marcador oculto no fim do corpo: a triagem acha por ele as issues do botão (o mesmo
 * do caminho sem relay, src/components/relato/corpoIssue.ts). O build só leva
 * [A-Za-z0-9._-], sem "--", para não fechar o comentário.
 */
export function marcadorRelato(build: string | undefined) {
  const limpo = (build ?? "")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
  return `<!-- openstrut-relato v1 build=${limpo || "desconhecido"} -->`;
}

/** Corpo da issue. O e-mail nunca entra: só a informação de que o autor deixou contato. */
export function corpoIssue(relato: Relato, anexos: Anexos) {
  const secoes = [
    `### O que aconteceu\n\n${citar(relato.aconteceu)}`,
    `### O que esperava\n\n${relato.esperado ? citar(relato.esperado) : "_Não informado._"}`,
  ];
  const privado = anexos.separados ? " (no repositório privado dos anexos)" : "";
  if (anexos.temPrint)
    secoes.push(
      anexos.separados
        ? `### Print\n\n[print.png](${urlPrint(anexos)})${privado}`
        : `### Print\n\n![print](${urlPrint(anexos)})`,
    );
  if (anexos.nomeObra) {
    secoes.push(
      `### Obra\n\n[${anexos.nomeObra}](${urlObra(anexos, anexos.nomeObra)})${privado}`,
    );
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

  // o marcador fica sempre no fim, também quando o corpo é cortado
  const marcador = marcadorRelato(relato.build);
  const teto = LIMITE_CORPO - marcador.length - 20;
  const corpo = [...secoes, ...fim].join("\n\n");
  const cortado = corpo.length > teto ? `${corpo.slice(0, teto)}\n\n… (truncado)` : corpo;
  return `${cortado}\n\n${marcador}`;
}
