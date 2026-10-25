// Relato automático da importação de obra do SISTRUT (docs/RELATO.md): quando a
// importação ou o cálculo da obra importada dá erro, o app manda o relato pelo relay
// sozinho, com os arquivos escolhidos inteiros, que o relay guarda no repositório
// privado dos anexos, para o problema ser reproduzido. O texto da issue é público:
// o nome da obra (e o do .COL e das pastas, que costumam ser o dela) sai como "OBRA".
// Só com relay e com a opção ligada (padrão), um relato por problema (mesmos arquivos
// e mesmas mensagens) e no máximo LIMITE_DIA por dia. Sem rede, vai para a fila.
import type { Obra } from "../../dominio/obra";
import type { ArquivoEntrada } from "../../telas/InicioSistrut";
import { enviarComToken } from "./acoes";
import { coletarDiagnostico } from "./diagnostico";
import { enfileirar } from "./fila";
import { caminhoRelato, paraBase64, type RelatoEnviado } from "./relay";

export interface ProblemaImportacao {
  etapa: "importação" | "cálculo";
  /** O que deu errado, como a tela mostra. */
  mensagens: string[];
  arquivos: readonly ArquivoEntrada[];
  /** A obra montada, quando a importação passou e o cálculo falhou. */
  obra?: Obra;
}

export type EstadoRelatoAutomatico =
  | { tipo: "enviado"; numero: number; url: string }
  | { tipo: "fila" }
  | { tipo: "recusado"; mensagem: string }
  /** não enviou: opção desligada, build sem relay, problema já relatado ou limite do dia */
  | { tipo: "nao-enviado"; motivo: "desligado" | "sem-relay" | "repetido" | "limite" };

const CHAVE_OPCAO = "openstrut.relatoAutomatico";
const CHAVE_ENVIADOS = "openstrut.relatosAutomaticos";
export const LIMITE_DIA = 5;
/** Limite do relay para a obra (2 MiB), com folga para o JSON em volta. */
const LIMITE_ANEXO = 1_900_000;

/** Opção do usuário; ligada quando nunca foi mexida ou sem localStorage. */
export function relatoAutomaticoLigado() {
  try {
    return localStorage.getItem(CHAVE_OPCAO) !== "nao";
  } catch {
    return true;
  }
}

export function ligarRelatoAutomatico(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE_OPCAO, ligado ? "sim" : "nao");
  } catch {
    // modo privado sem localStorage: a opção vale só nesta visita
  }
}

/** Nomes que identificam a obra do cliente: o da obra, o do .COL e as pastas. */
export function nomesDaObra(p: Pick<ProblemaImportacao, "arquivos" | "obra">) {
  const nomes = new Set<string>();
  if (p.obra?.nome) nomes.add(p.obra.nome);
  for (const a of p.arquivos) {
    const m = /^(.+)\.col$/i.exec(a.nome);
    if (m?.[1]) nomes.add(m[1]);
    for (const pasta of (a.caminho ?? "").split(/[\\/]/).slice(0, -1)) nomes.add(pasta);
  }
  return [...nomes].filter((n) => n.trim().length >= 3);
}

/** Troca os nomes da obra por "OBRA" (sem diferenciar maiúsculas). */
export function anonimizar(texto: string, nomes: readonly string[]) {
  return [...nomes]
    .sort((a, b) => b.length - a.length)
    .reduce(
      (t, n) => t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "OBRA"),
      texto,
    );
}

const tamanho = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1).replace(".", ",")} kB`;

/** Os arquivos (e a obra) em JSON para o anexo privado; grandes demais, só a lista. */
export function anexoDosArquivos(p: Pick<ProblemaImportacao, "arquivos" | "obra">) {
  const arquivos = p.arquivos.map((a) => ({
    nome: a.nome,
    ...(a.caminho ? { caminho: a.caminho } : {}),
    base64: paraBase64(a.dados),
  }));
  const comObra = JSON.stringify({ tipo: "arquivos-sistrut", versao: 1, arquivos, obra: p.obra });
  if (comObra.length <= LIMITE_ANEXO) return { json: comObra, completo: true };
  const soArquivos = JSON.stringify({ tipo: "arquivos-sistrut", versao: 1, arquivos });
  if (soArquivos.length <= LIMITE_ANEXO) return { json: soArquivos, completo: true };
  const lista = p.arquivos.map((a) => ({ nome: a.nome, bytes: a.dados.length }));
  return { json: JSON.stringify({ tipo: "arquivos-sistrut", versao: 1, lista }), completo: false };
}

/** O relato que vai ao relay; o texto público passa por `anonimizar`. */
export function relatoAutomatico(p: ProblemaImportacao, rota: string): RelatoEnviado {
  const nomes = nomesDaObra(p);
  const limpo = (t: string) => anonimizar(t, nomes);
  // sem a obra no diagnóstico: o resumo dela traz o nome
  const diagnostico = coletarDiagnostico(null, rota);
  const anexo = anexoDosArquivos(p);
  const primeira = limpo(p.mensagens[0] ?? "erro").replace(/\s+/g, " ");
  const titulo = `Importação do SISTRUT (${p.etapa}): ${primeira}`;
  const lista = p.arquivos.map((a) => `${limpo(a.nome)} (${tamanho(a.dados.length)})`).join(", ");
  const aconteceu = [
    `Relato automático: a ${p.etapa} da obra do SISTRUT deu erro.`,
    "",
    ...p.mensagens.map((m) => `- ${limpo(m)}`),
    ...(anexo.completo ? [] : ["", "Os arquivos passam do limite do anexo: só vai a lista."]),
  ].join("\n");
  return {
    versao: 1,
    titulo: titulo.length > 120 ? `${titulo.slice(0, 119)}…` : titulo,
    aconteceu: aconteceu.length > 5000 ? `${aconteceu.slice(0, 4999)}…` : aconteceu,
    esperado: "Importar e calcular a obra sem erro.",
    diagnostico: [
      ...diagnostico.itens.map((i) => ({ ...i, valor: limpo(i.valor) })),
      { rotulo: "Etapa", valor: p.etapa },
      { rotulo: "Arquivos", valor: lista.length > 1000 ? `${lista.slice(0, 999)}…` : lista },
    ].slice(0, 30),
    erros: diagnostico.erros.map(limpo),
    build: diagnostico.build,
    obra: { nome: "arquivos-sistrut.json", json: anexo.json },
  };
}

/** Identifica o problema: a etapa, as mensagens e os arquivos (nome e conteúdo). */
async function assinatura(p: ProblemaImportacao) {
  const partes = [p.etapa, ...p.mensagens, ...p.arquivos.map((a) => `${a.nome}:${a.dados.length}`)];
  const bytes = new TextEncoder().encode(partes.join("\n"));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface Enviados {
  dia: string;
  hoje: number;
  assinaturas: string[];
}

function lerEnviados(dia: string): Enviados {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_ENVIADOS) ?? "null") as Enviados | null;
    if (v && Array.isArray(v.assinaturas))
      return { dia, hoje: v.dia === dia ? v.hoje : 0, assinaturas: v.assinaturas };
  } catch {
    // sem localStorage ou valor estragado: começa de novo
  }
  return { dia, hoje: 0, assinaturas: [] };
}

function gravarEnviados(e: Enviados) {
  try {
    localStorage.setItem(CHAVE_ENVIADOS, JSON.stringify(e));
  } catch {
    // sem localStorage: o limite vale só nesta visita
  }
}

/** Envia o relato automático do problema, se a opção, o relay e os limites deixam. */
export async function relatarProblemaImportacao(
  p: ProblemaImportacao,
  rota = location.pathname,
  agora = new Date(),
): Promise<EstadoRelatoAutomatico> {
  const caminho = caminhoRelato();
  if (caminho.tipo !== "relay") return { tipo: "nao-enviado", motivo: "sem-relay" };
  if (!relatoAutomaticoLigado()) return { tipo: "nao-enviado", motivo: "desligado" };
  const enviados = lerEnviados(agora.toISOString().slice(0, 10));
  const id = await assinatura(p);
  if (enviados.assinaturas.includes(id)) return { tipo: "nao-enviado", motivo: "repetido" };
  if (enviados.hoje >= LIMITE_DIA) return { tipo: "nao-enviado", motivo: "limite" };
  gravarEnviados({
    ...enviados,
    hoje: enviados.hoje + 1,
    assinaturas: [...enviados.assinaturas, id].slice(-50),
  });
  const relato = relatoAutomatico(p, rota);
  const r = navigator.onLine
    ? await enviarComToken(caminho.url, relato)
    : ({ tipo: "rede" } as const);
  if (r.tipo === "enviado") return r;
  if (r.tipo === "recusado") return { tipo: "recusado", mensagem: r.mensagem };
  await enfileirar(relato);
  return { tipo: "fila" };
}
