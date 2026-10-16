// Arquivos do relato no aparelho do usuário: download, print na área de transferência
// e o zip do relato (markdown, PNG e obra) para mandar depois.
import { montarZip, type ArquivoZip } from "./zip";

/** Carimbo de data para nomes de arquivo: AAAA-MM-DD-HHMM, na hora local. */
export function carimbo(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Nome de arquivo seguro a partir do nome da obra. */
export function nomeArquivoObra(nome: string) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "obra"}.openstrut.json`;
}

export function nomesRelato(agora: Date, nomeObra: string | null) {
  const c = carimbo(agora);
  return {
    print: `relato-${c}.png`,
    zip: `relato-${c}.zip`,
    obra: nomeObra === null ? null : nomeArquivoObra(nomeObra),
  };
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  // o download já começou; libera depois para o navegador ler o blob
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Põe o PNG na área de transferência. false quando o navegador não deixa. */
export async function copiarImagem(png: Blob) {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    return false;
  }
}

/** Zip do relato: relato.md e, quando marcados, o print e a obra. */
export function zipRelato(arquivos: {
  markdown: string;
  print: { nome: string; dados: Uint8Array } | null;
  obra: { nome: string; json: string } | null;
}) {
  const lista: ArquivoZip[] = [{ nome: "relato.md", dados: arquivos.markdown }];
  if (arquivos.print) lista.push(arquivos.print);
  if (arquivos.obra) lista.push({ nome: arquivos.obra.nome, dados: arquivos.obra.json });
  return new Blob([montarZip(lista)], { type: "application/zip" });
}
