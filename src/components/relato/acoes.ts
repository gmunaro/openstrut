// Ações do diálogo de relato: abrir a issue no GitHub (sem relay), enviar ao relay
// (com fila quando falta rede) e salvar o arquivo do relato. Recebem só o que o usuário
// deixou marcado: print e obra desmarcados chegam aqui como null.
import { baixar, copiarImagem, nomesRelato, zipRelato } from "./arquivos";
import {
  type AnexosCorpo,
  corpoRelato,
  type TextoRelato,
  tituloRelato,
  urlNovaIssue,
} from "./corpoIssue";
import type { Diagnostico } from "./diagnostico";
import { enfileirar, enviarFila, type RelatoNaFila } from "./fila";
import { deBase64, enviarAoRelay, paraBase64, type RelatoEnviado } from "./relay";
import { tokenTurnstile } from "./turnstile";

export interface DadosRelato {
  texto: TextoRelato;
  diagnostico: Diagnostico;
  print: Blob | null;
  /** Nome da obra e o JSON dela (serializarObra). */
  obra: { nome: string; json: string } | null;
  agora: Date;
}

function nomes(d: DadosRelato) {
  return nomesRelato(d.agora, d.obra?.nome ?? null);
}

function anexos(d: DadosRelato, destino: AnexosCorpo["destino"]): AnexosCorpo {
  const n = nomes(d);
  return { destino, print: d.print ? n.print : null, obra: d.obra ? n.obra : null };
}

/** URL da nova issue para o relato (o que o usuário confere antes de abrir). */
export const urlGithub = (d: DadosRelato) =>
  urlNovaIssue(d.texto, d.diagnostico, anexos(d, "github"));

/**
 * Caminho sem relay: copia o print para a área de transferência, baixa o PNG e abre a
 * página de nova issue já preenchida. A obra é baixada à parte (botão próprio), porque
 * o navegador bloqueia dois downloads seguidos.
 */
export async function abrirNoGithub(d: DadosRelato) {
  const { url, cortado } = urlGithub(d);
  let copiado = false;
  if (d.print) {
    // antes de abrir a aba: com a página sem foco, o navegador recusa a área de transferência
    copiado = await copiarImagem(d.print);
    baixar(d.print, nomes(d).print);
  }
  const janela = window.open(url, "_blank");
  if (janela) janela.opener = null;
  return { url, cortado, copiado, bloqueado: janela === null };
}

export function baixarObra(d: DadosRelato) {
  const n = nomes(d);
  if (d.obra && n.obra) baixar(new Blob([d.obra.json], { type: "application/json" }), n.obra);
}

/** Salva o zip do relato (relato.md, PNG e obra) para mandar depois. */
export async function salvarArquivo(d: DadosRelato) {
  const n = nomes(d);
  const markdown = `# ${tituloRelato(d.texto.aconteceu)}\n\n${corpoRelato(d.texto, d.diagnostico, anexos(d, "arquivo"))}\n`;
  const print = d.print
    ? { nome: n.print, dados: new Uint8Array(await d.print.arrayBuffer()) }
    : null;
  const obra = d.obra && n.obra ? { nome: n.obra, json: d.obra.json } : null;
  baixar(zipRelato({ markdown, print, obra }), n.zip);
}

/** O corpo do POST ao relay, sem o token do Turnstile. */
export async function relatoParaRelay(d: DadosRelato): Promise<RelatoEnviado> {
  const n = nomes(d);
  const t = d.texto;
  return {
    versao: 1,
    titulo: tituloRelato(t.aconteceu).replace(/^\[Relato\] /, ""),
    aconteceu: t.aconteceu.trim(),
    esperado: t.esperado.trim(),
    ...(t.email.trim() ? { email: t.email.trim() } : {}),
    diagnostico: d.diagnostico.itens,
    erros: d.diagnostico.erros,
    ...(d.print ? { print: paraBase64(new Uint8Array(await d.print.arrayBuffer())) } : {}),
    ...(d.obra && n.obra ? { obra: { nome: n.obra, json: d.obra.json } } : {}),
  };
}

/** Envia com um token novo do Turnstile, se o build pede. */
async function enviarComToken(url: string, relato: RelatoEnviado) {
  const sitekey = import.meta.env.VITE_TURNSTILE_SITEKEY;
  if (!sitekey) return enviarAoRelay(url, relato);
  try {
    return enviarAoRelay(url, { ...relato, turnstile: await tokenTurnstile(sitekey) });
  } catch {
    return navigator.onLine
      ? ({ tipo: "temporario", mensagem: "A verificação anti-spam não respondeu." } as const)
      : ({ tipo: "rede" } as const);
  }
}

export type ResultadoEnvio =
  | { tipo: "enviado"; numero: number; url: string }
  | { tipo: "fila"; motivo: string }
  | { tipo: "recusado"; mensagem: string };

/** Caminho com relay. Sem rede ou com falha temporária, o relato vai para a fila. */
export async function enviarPeloRelay(url: string, d: DadosRelato): Promise<ResultadoEnvio> {
  const relato = await relatoParaRelay(d);
  const r = navigator.onLine ? await enviarComToken(url, relato) : ({ tipo: "rede" } as const);
  if (r.tipo === "enviado" || r.tipo === "recusado") return r;
  await enfileirar(relato);
  return { tipo: "fila", motivo: r.tipo === "rede" ? "sem conexão" : r.mensagem };
}

/** Reenvia a fila (ao abrir o app e quando a rede volta). */
export const enviarFilaAgora = (url: string) => enviarFila((r) => enviarComToken(url, r));

/** Zip de um relato guardado na fila (o relay recusou; o usuário manda por outro meio). */
export function zipDaFila(item: RelatoNaFila) {
  const r = item.relato;
  const texto = { aconteceu: r.aconteceu, esperado: r.esperado, email: r.email ?? "" };
  const diagnostico = { itens: r.diagnostico, erros: r.erros };
  const n = nomesRelato(new Date(item.criado), null);
  const a: AnexosCorpo = {
    destino: "arquivo",
    print: r.print ? n.print : null,
    obra: r.obra?.nome ?? null,
  };
  return {
    nome: n.zip,
    blob: zipRelato({
      markdown: `# [Relato] ${r.titulo}\n\n${corpoRelato(texto, diagnostico, a)}\n`,
      print: r.print ? { nome: n.print, dados: deBase64(r.print) } : null,
      obra: r.obra ?? null,
    }),
  };
}
