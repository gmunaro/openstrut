// Baixa os arquivos de um relato automático da importação do SISTRUT para reproduzir o
// erro (docs/RELATO.md, "Relato automático da importação").
// Uso: bun scripts/relatos/baixar.ts <número da issue> [pasta]   (padrão: relato-<número>)
// Precisa do gh logado com acesso ao repositório privado dos anexos.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [numero, pastaArg] = process.argv.slice(2);
if (!numero || !/^\d+$/.test(numero)) {
  console.error("Uso: bun scripts/relatos/baixar.ts <número da issue> [pasta]");
  process.exit(1);
}
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8" });

const corpo = gh(
  "issue",
  "view",
  numero,
  "-R",
  "gmunaro/openstrut",
  "--json",
  "body",
  "--jq",
  ".body",
);
// link da obra no corpo: https://github.com/<repo>/blob/<branch>/<caminho>
const link = /https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(\S+?\.json)\)/.exec(corpo);
if (!link) {
  console.error(`A issue #${numero} não tem anexo de obra.`);
  process.exit(1);
}
const [, repo, branch, caminho] = link;
const conteudo = gh("api", `repos/${repo}/contents/${caminho}?ref=${branch}`, "--jq", ".content");
const anexo = JSON.parse(Buffer.from(conteudo, "base64").toString("utf8")) as {
  tipo?: string;
  arquivos?: { nome: string; caminho?: string; base64: string }[];
  lista?: { nome: string; bytes: number }[];
  obra?: unknown;
};
const pasta = path.resolve(pastaArg ?? `relato-${numero}`);
mkdirSync(pasta, { recursive: true });
if (anexo.tipo !== "arquivos-sistrut") {
  // relato do botão: a obra da V2 inteira
  writeFileSync(path.join(pasta, "obra.openstrut.json"), JSON.stringify(anexo, null, 2));
  console.log(`Obra da V2 em ${pasta}/obra.openstrut.json`);
  process.exit(0);
}
for (const a of anexo.arquivos ?? [])
  writeFileSync(path.join(pasta, a.nome), Buffer.from(a.base64, "base64"));
if (anexo.obra)
  writeFileSync(path.join(pasta, "obra.openstrut.json"), JSON.stringify(anexo.obra, null, 2));
console.log(
  anexo.arquivos
    ? `${anexo.arquivos.length} arquivos do SISTRUT em ${pasta}${anexo.obra ? ", com a obra montada" : ""}`
    : `Os arquivos passaram do limite do anexo; só a lista: ${JSON.stringify(anexo.lista)}`,
);
