// Confere e migra as citações "ARQ.BAS:linha" para o formato com o endereço do comando
// ("ARQ.BAS:linha@endereço", ver src/calculo/sistrut/__oraculo__/referenciasBas.ts).
//
// Uso (na raiz do repositório):
//   bun scripts/sistrut/referencias-bas.ts docs/MODO-CALCULO.md ...             confere
//   bun scripts/sistrut/referencias-bas.ts --candidatos docs/MODO-CALCULO.md ...
//   bun scripts/sistrut/referencias-bas.ts --migrar [--decisoes d.tsv] docs/MODO-CALCULO.md ...
//   bun scripts/sistrut/referencias-bas.ts --atualizar docs/MODO-CALCULO.md ...
//
// Em ca78cb2 a V1 regenerou 31 .BAS com linhas novas de ON KEY, e a numeração deslocou.
// Uma citação sem endereço pode estar na numeração antiga (7752640) ou na nova, e o git
// blame não decide (o texto foi reeditado depois, com citações de antes). Cada número sem
// endereço tem dois candidatos: N, como está, e N′, a linha atual do comando que estava
// na linha N antes da regeneração. Quando são iguais, não há dúvida.
// --candidatos: TSV dos números com N ≠ N′, com o texto das duas linhas e a afirmação,
//   para conferir pelo conteúdo qual vale.
// --migrar: põe o endereço em cada número sem ele: o de N quando N = N′; nos outros, a
//   linha escolhida no arquivo de decisões (TSV "caminho, linha do texto, ARQ, N, linha
//   escolhida"); sem decisão, acusa e não mexe.
// --atualizar: refaz pelo endereço a linha das citações que já o têm (depois de uma nova
//   regeneração dos .BAS).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  citacoes,
  conferirCitacoes,
  enderecoNaLinha,
  lerBas,
  linhaDoEndereco,
  PASTA_BAS,
} from "../../src/calculo/sistrut/__oraculo__/referenciasBas";

const DIST = dirname(PASTA_BAS);
/** O commit da V1 antes de ca78cb2, que regenerou os .BAS. */
const ANTES = "7752640";

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "latin1", maxBuffer: 1 << 28 });

const cache = new Map<string, string[] | undefined>();
function bas(arquivo: string, antigo: boolean) {
  const k = `${antigo ? "a" : "n"}|${arquivo}`;
  if (!cache.has(k)) {
    if (!antigo) cache.set(k, lerBas(arquivo));
    else {
      const familia = readdirSync(PASTA_BAS).find((f) =>
        existsSync(join(PASTA_BAS, f, `${arquivo}.BAS`)),
      );
      cache.set(
        k,
        familia
          ? git(DIST, ["show", `${ANTES}:src-original/${familia}/${arquivo}.BAS`]).split(/\r?\n/)
          : undefined,
      );
    }
  }
  return cache.get(k);
}

/** N′: a linha atual do comando que estava na linha n antes da regeneração (rótulo sem
 *  endereço: a mesma distância até o comando seguinte). */
function mapeada(arquivo: string, n: number) {
  const velho = bas(arquivo, true);
  const atual = bas(arquivo, false);
  const endereco = velho && enderecoNaLinha(velho, n);
  const noVelho = velho && endereco ? linhaDoEndereco(velho, endereco) : undefined;
  const noAtual = atual && endereco ? linhaDoEndereco(atual, endereco) : undefined;
  return noVelho !== undefined && noAtual !== undefined ? noAtual - (noVelho - n) : undefined;
}

const args = process.argv.slice(2);
const opcao = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const modo = args.includes("--migrar")
  ? "migrar"
  : args.includes("--atualizar")
    ? "atualizar"
    : args.includes("--candidatos")
      ? "candidatos"
      : "conferir";
const decisoes = new Map<string, number>();
const arqDecisoes = opcao("--decisoes");
if (arqDecisoes)
  for (const l of readFileSync(arqDecisoes, "utf8").split(/\r?\n/)) {
    const [c, lt, arq, n, escolha] = l.split("\t");
    if (escolha && /^\d+$/.test(escolha)) decisoes.set(`${c}|${lt}|${arq}|${n}`, Number(escolha));
  }
const arquivos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--decisoes");
let problemas = 0;

if (modo === "candidatos")
  console.log(
    ["caminho", "linha_texto", "ARQ", "N", "N2", "texto_N", "texto_N2", "afirmacao"].join("\t"),
  );

for (const caminho of arquivos) {
  const texto = readFileSync(caminho, "utf8");
  if (modo === "conferir") {
    const ps = conferirCitacoes(texto);
    problemas += ps.length;
    for (const p of ps) console.log(`${caminho}: ${p}`);
    continue;
  }
  const linhasTexto = texto.split("\n");
  const trocas: { inicio: number; fim: number; novo: string }[] = [];
  for (const c of citacoes(texto)) {
    const atual = bas(c.arquivo, false);
    if (!atual) {
      console.log(`${caminho}:${c.linhaTexto}: ${c.arquivo}.BAS não encontrado`);
      problemas++;
      continue;
    }
    for (const n of c.numeros) {
      let linha: number | undefined;
      let origem: string;
      if (modo === "atualizar") {
        if (!n.endereco) continue;
        linha = linhaDoEndereco(atual, n.endereco);
        origem = "endereço";
      } else {
        if (n.endereco) continue;
        const n2 = mapeada(c.arquivo, n.linha);
        if (modo === "candidatos") {
          if (n2 !== n.linha) {
            const t = (k: number | undefined) =>
              k === undefined ? "" : (atual[k - 1] ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
            console.log(
              [
                caminho,
                c.linhaTexto,
                c.arquivo,
                n.linha,
                n2 ?? "",
                t(n.linha),
                t(n2),
                (linhasTexto[c.linhaTexto - 1] ?? "").replace(/\t/g, " ").slice(0, 500),
              ].join("\t"),
            );
          }
          continue;
        }
        const decidida = decisoes.get(`${caminho}|${c.linhaTexto}|${c.arquivo}|${n.linha}`);
        linha = n2 === n.linha ? n.linha : decidida;
        origem = n2 === n.linha ? "numeração igual" : decidida ? "decisão" : "sem decisão";
      }
      const endereco = linha === undefined ? undefined : enderecoNaLinha(atual, linha);
      if (linha === undefined || !endereco) {
        console.log(
          `${caminho}:${c.linhaTexto}: ${c.arquivo}.BAS:${n.linha} sem endereço (${origem})`,
        );
        problemas++;
        continue;
      }
      const novo = `${linha}@${endereco}`;
      if (texto.slice(n.inicio, n.fim) !== novo) {
        trocas.push({ inicio: n.inicio, fim: n.fim, novo });
        console.log(
          `${caminho}:${c.linhaTexto}: ${c.arquivo}.BAS:${texto.slice(n.inicio, n.fim)} → ${novo} (${origem})`,
        );
      }
    }
  }
  let novo = texto;
  for (const t of trocas.sort((a, b) => b.inicio - a.inicio))
    novo = novo.slice(0, t.inicio) + t.novo + novo.slice(t.fim);
  if (novo !== texto) writeFileSync(caminho, novo);
}
if (modo !== "candidatos") console.log(`${problemas} problema(s)`);
process.exit(problemas > 0 && modo !== "candidatos" ? 1 : 0);
