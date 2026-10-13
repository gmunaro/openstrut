// Abrir e salvar o arquivo .openstrut.json no disco do usuário. Usa a File System
// Access API quando o navegador tem (Chrome, Edge): o arquivo aberto pode ser
// regravado no mesmo lugar. Sem ela, cai para <input type=file> e download.
// Abrir aceita também o .sistrut.json de antes do renome (qualquer .json, na verdade:
// quem decide se é uma obra é lerObra).
import { EXTENSAO, EXTENSOES_ACEITAS } from "../armazenamento/arquivo";

/** Partes da File System Access API que o lib.dom do TypeScript ainda não declara. */
interface OpcoesSeletor {
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}
interface JanelaComSeletores {
  showOpenFilePicker?: (
    o?: OpcoesSeletor & { multiple?: boolean },
  ) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (
    o?: OpcoesSeletor & { suggestedName?: string },
  ) => Promise<FileSystemFileHandle>;
}

const TIPOS: NonNullable<OpcoesSeletor["types"]> = [
  { description: "Obra do OpenStrut", accept: { "application/json": [".json"] } },
];

/** `accept` do <input type=file> de abrir: as extensões da obra e qualquer JSON. */
export const ACEITA_AO_ABRIR = [...EXTENSOES_ACEITAS, ".json", "application/json"].join(",");

const janela = () => window as Window & JanelaComSeletores;

/** O usuário fechou o seletor sem escolher. */
const cancelado = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export interface ArquivoLido {
  nome: string;
  texto: string;
  /** Para regravar no mesmo arquivo; null no modo alternativo. */
  handle: FileSystemFileHandle | null;
}

/** Nome de arquivo para a obra: o nome sem caracteres proibidos no Windows + ".openstrut.json". */
export function nomeArquivoSugerido(nomeObra: string) {
  const base = nomeObra
    .replace(/[<>:"/\\|?*]/g, "")
    .split("")
    .filter((c) => c.charCodeAt(0) >= 32)
    .join("")
    .trim()
    .replace(/\s+/g, " ");
  return `${base === "" ? "obra" : base}${EXTENSAO}`;
}

/** Pede um arquivo ao usuário e devolve o texto, ou null se ele cancelar. */
export async function escolherArquivo(): Promise<ArquivoLido | null> {
  const w = janela();
  // chamado como método de window: solto, o Chrome lança 'Illegal invocation'
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: TIPOS, multiple: false });
      if (!handle) return null;
      const arquivo = await handle.getFile();
      return { nome: arquivo.name, texto: await arquivo.text(), handle };
    } catch (e) {
      if (cancelado(e)) return null;
      throw e;
    }
  }
  const arquivo = await escolherPorInput();
  return arquivo ? { nome: arquivo.name, texto: await arquivo.text(), handle: null } : null;
}

function escolherPorInput() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACEITA_AO_ABRIR;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export type ResultadoGravacao =
  | { tipo: "gravado"; nome: string; handle: FileSystemFileHandle }
  | { tipo: "baixado"; nome: string }
  | { tipo: "cancelado" };

/** Grava o texto: no `handle` dado (salvar), ou pergunta onde (salvar como /
 *  primeira vez). Sem a API, baixa o arquivo pela pasta de downloads. */
export async function gravarArquivo(
  texto: string,
  nomeSugerido: string,
  handle: FileSystemFileHandle | null,
): Promise<ResultadoGravacao> {
  const w = janela();
  try {
    const destino =
      handle ??
      (w.showSaveFilePicker
        ? await w.showSaveFilePicker({ suggestedName: nomeSugerido, types: TIPOS })
        : null);
    if (destino) {
      const escrita = await destino.createWritable();
      await escrita.write(texto);
      await escrita.close();
      return { tipo: "gravado", nome: destino.name, handle: destino };
    }
  } catch (e) {
    if (cancelado(e)) return { tipo: "cancelado" };
    throw e;
  }
  baixar(texto, nomeSugerido);
  return { tipo: "baixado", nome: nomeSugerido };
}

function baixar(texto: string, nome: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
