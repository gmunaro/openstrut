// Roda a importação e o cálculo da V2 sobre todas as obras do SISTRUT que acharmos em disco,
// para ver quais o importador e o motor aguentam e quais quebram.
//
// Uso:
//   bun scripts/sistrut/importar-corpus.ts --v2 <raiz da V2> [--rotulo nome] [--saida arq.json]
//       [--filtro trecho] [--paralelo 4] [--limite-s 120] [--compara rodada-anterior.json]
//
// --v2 é a raiz de um checkout da V2 (o worktree da main, o do outro agente, ...): o script
// importa `src/telas/InicioSistrut.ts`, `src/calculo/fluxo.ts`, `src/calculo/normas` e
// `src/telas/calculo.ts` de lá, então a mesma rodada serve para comparar branches.
//
// Uma obra é uma pasta com ao menos um arquivo de dados do SISTRUT (DADOS abaixo). Entram
// na importação todos os arquivos da pasta, menos os que não são do SISTRUT (FORA): é o
// que o usuário selecionaria na pasta da obra. Cada obra roda num processo filho, com
// tempo limite, para que um laço sem fim ou um estouro de pilha não derrube a rodada.
//
// Saída: uma tabela Markdown no stdout e um JSON com tudo (avisos e erros por extenso) em
// --saida (padrão C:/tmp/corpus/<rotulo>-<data>.json, fora do repositório: o corpus inclui
// dados de cliente). Com --compara, imprime as obras cujo estado mudou.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const V1 = "C:/Users/MunaroPC/Desktop/Projetos Pessoais/_Arquivo/Sistrust/dist";
const ORACULO = "C:/tmp/oraculo";
const CLIENTE = "C:/tmp/cliente-drive";

/** Extensões de dados do SISTRUT: a pasta que tem uma delas é uma obra. */
const DADOS = new Set("LAJ VIG SEC FOR TAB COL PIP PIL REP RLP EDV FRM DSP LAP BAK FOK".split(" "));
/** Arquivos que não são do SISTRUT (executáveis, fontes e saídas do harness de testes do
 *  QB, notas): ficam fora da seleção. */
const FORA = new Set(
  "EXE COM BAT BAS BI BM LIB OBJ TXT MD JSON PY SH TS CPP LOG POS GITIGNORE CGA E0 E1 E2 E3 PRN PNG".split(
    " ",
  ),
);
const MARCA = "@@CORPUS@@";

// ---------------------------------------------------------------------------------------
// Tipos do resultado (o JSON da rodada)

type Modo = "original" | "corrigido";

interface Etapa {
  ok: boolean;
  ms: number;
  /** Mensagem da exceção (primeira linha) ou dos erros devolvidos. */
  erro?: string;
  /** Pilha da exceção, até 8 linhas. */
  pilha?: string;
}

interface Calculo extends Etapa {
  avisos: number;
  falhas: number;
  /** Textos distintos dos avisos, para classificar. */
  textos: string[];
}

interface ResultadoObraCorpus {
  id: string;
  fonte: string;
  pasta: string;
  arquivos: string[];
  leituraMs: number;
  importacao: Etapa & { erros: string[]; avisos: string[] };
  resumo?: { pavimentos: number; lajes: number; vigas: number; pilares: number; norma: string };
  calculo: Partial<Record<Modo, Calculo>>;
  /** Processo filho estourou o tempo ou morreu. */
  processo?: string;
}

interface Rodada {
  rotulo: string;
  v2: string;
  commit: string;
  data: string;
  obras: ResultadoObraCorpus[];
}

// ---------------------------------------------------------------------------------------
// Argumentos

function argumentos(argv: string[]) {
  const a = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k?.startsWith("--")) a.set(k.slice(2), argv[i + 1] ?? "");
    if (k?.startsWith("--")) i++;
  }
  return a;
}

const extensao = (nome: string) => {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toUpperCase();
};

// ---------------------------------------------------------------------------------------
// Descoberta das obras

const ehPasta = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const filhos = (p: string) => (ehPasta(p) ? readdirSync(p).map((n) => join(p, n)) : []);
const arquivosDe = (p: string) => filhos(p).filter((f) => !ehPasta(f));
const temDados = (p: string) => arquivosDe(p).some((f) => DADOS.has(extensao(f)));

/** A pasta e todas as subpastas. */
function arvore(p: string): string[] {
  return [p, ...filhos(p).filter(ehPasta).flatMap(arvore)];
}

interface PastaObra {
  id: string;
  fonte: string;
  pasta: string;
}

function descobrir(): PastaObra[] {
  const obras: PastaObra[] = [];
  const add = (fonte: string, pasta: string, base: string) => {
    if (temDados(pasta))
      obras.push({ id: `${fonte}/${relative(base, pasta).replaceAll("\\", "/")}`, fonte, pasta });
  };
  for (const run of filhos(join(ORACULO, "runs")))
    add("oraculo-run", join(run, "obra"), join(ORACULO, "runs"));
  for (const caso of filhos(join(ORACULO, "casos")).filter((p) => p.endsWith(".dados")))
    add("oraculo-caso", caso, join(ORACULO, "casos"));
  for (const r of filhos(join(V1, "roteiros")).filter((p) => p.endsWith(".dados")))
    add("v1-roteiro", r, join(V1, "roteiros"));
  for (const p of arvore(join(V1, "tests/retraducao"))) add("v1-retraducao", p, join(V1, "tests"));
  for (const p of arvore(join(V1, "sistrut-game"))) add("v1-game", p, V1);
  for (const p of arvore(CLIENTE)) add("cliente", p, CLIENTE);
  return obras;
}

// ---------------------------------------------------------------------------------------
// Uma obra (processo filho)

interface ArquivoEntrada {
  nome: string;
  dados: Uint8Array;
}
interface ObraV2 {
  norma: string;
  modoCalculo?: Modo;
  pavimentos: { lajes: unknown[]; vigas: unknown[]; pilares: unknown[] }[];
}
type ResultadoImportacao =
  | { ok: true; obra: ObraV2; avisos?: string[] }
  | { ok: false; erros?: string[]; avisos?: string[] };
interface ResultadoCalculo {
  avisos: string[];
}
interface Modulos {
  importarObraSistrut: (a: readonly ArquivoEntrada[]) => ResultadoImportacao;
  calcularObra: (obra: ObraV2, norma: unknown) => ResultadoCalculo;
  normaPorId: (id: string) => unknown;
  coletarAvisos?: (r: ResultadoCalculo) => { texto: string }[];
  coletarFalhas?: (r: ResultadoCalculo) => { texto: string }[];
}

async function carregar(v2: string): Promise<Modulos> {
  const imp = (rel: string) => import(pathToFileURL(join(v2, rel)).href);
  const [inicio, fluxo, normas, tela] = await Promise.all([
    imp("src/telas/InicioSistrut.ts"),
    imp("src/calculo/fluxo.ts"),
    imp("src/calculo/normas/index.ts"),
    imp("src/telas/calculo.ts").catch(() => ({})),
  ]);
  return { ...inicio, ...fluxo, ...normas, ...tela } as Modulos;
}

const agora = () => performance.now();
const ms = (t0: number) => Math.round(agora() - t0);

function falha(e: unknown): { erro: string; pilha?: string } {
  if (!(e instanceof Error)) return { erro: String(e) };
  const pilha = e.stack?.split("\n").slice(0, 8).join("\n");
  return { erro: `${e.name}: ${e.message}`.split("\n")[0] ?? e.name, ...(pilha ? { pilha } : {}) };
}

async function rodarObra(v2: string, alvo: PastaObra): Promise<ResultadoObraCorpus> {
  const m = await carregar(v2);
  let t0 = agora();
  const arquivos: ArquivoEntrada[] = arquivosDe(alvo.pasta)
    .filter((f) => !FORA.has(extensao(f)))
    .sort()
    .map((f) => ({ nome: basename(f), dados: new Uint8Array(readFileSync(f)) }));
  const r: ResultadoObraCorpus = {
    ...alvo,
    arquivos: arquivos.map((a) => a.nome),
    leituraMs: ms(t0),
    importacao: { ok: false, ms: 0, erros: [], avisos: [] },
    calculo: {},
  };

  t0 = agora();
  let obra: ObraV2 | undefined;
  try {
    const imp = m.importarObraSistrut(arquivos);
    r.importacao = {
      ok: imp.ok,
      ms: ms(t0),
      erros: imp.ok ? [] : (imp.erros ?? []),
      avisos: imp.avisos ?? [],
    };
    if (imp.ok) obra = imp.obra;
    else r.importacao.erro = (imp.erros ?? []).join(" | ");
  } catch (e) {
    r.importacao = { ok: false, ms: ms(t0), erros: [], avisos: [], ...falha(e) };
  }
  if (!obra) return r;

  const pav = obra.pavimentos;
  r.resumo = {
    pavimentos: pav.length,
    lajes: pav.reduce((s, p) => s + p.lajes.length, 0),
    vigas: pav.reduce((s, p) => s + p.vigas.length, 0),
    pilares: pav.reduce((s, p) => s + p.pilares.length, 0),
    norma: obra.norma,
  };
  const norma = m.normaPorId(obra.norma);
  for (const modo of ["original", "corrigido"] as const) {
    t0 = agora();
    try {
      if (!norma) throw new Error(`norma ${obra.norma} sem implementação`);
      const res = m.calcularObra({ ...obra, modoCalculo: modo }, norma);
      const avisos = m.coletarAvisos ? m.coletarAvisos(res).map((a) => a.texto) : res.avisos;
      const falhas = m.coletarFalhas ? m.coletarFalhas(res).length : 0;
      r.calculo[modo] = {
        ok: true,
        ms: ms(t0),
        avisos: avisos.length,
        falhas,
        textos: [...new Set(avisos)],
      };
    } catch (e) {
      r.calculo[modo] = { ok: false, ms: ms(t0), avisos: 0, falhas: 0, textos: [], ...falha(e) };
    }
  }
  return r;
}

// ---------------------------------------------------------------------------------------
// Rodada (processo pai)

async function noFilho(v2: string, alvo: PastaObra, limiteS: number): Promise<ResultadoObraCorpus> {
  const proc = Bun.spawn({
    cmd: [process.execPath, process.argv[1] ?? "", "--v2", v2, "--obra", JSON.stringify(alvo)],
    stdout: "pipe",
    stderr: "pipe",
  });
  let estourou = false;
  const timer = setTimeout(() => {
    estourou = true;
    proc.kill();
  }, limiteS * 1000);
  const [saida, erro] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  clearTimeout(timer);
  const linha = saida
    .split("\n")
    .reverse()
    .find((l) => l.startsWith(MARCA));
  if (linha) return JSON.parse(linha.slice(MARCA.length)) as ResultadoObraCorpus;
  const motivo = estourou
    ? `tempo limite de ${limiteS} s`
    : `processo saiu com ${proc.exitCode}: ${erro.trim().split("\n").slice(-3).join(" / ")}`;
  return {
    ...alvo,
    arquivos: arquivosDe(alvo.pasta).map((f) => basename(f)),
    leituraMs: 0,
    importacao: { ok: false, ms: 0, erros: [], avisos: [], erro: motivo },
    calculo: {},
    processo: motivo,
  };
}

/** Estado curto de uma etapa para a tabela. */
const estado = (e: Etapa | undefined) => (!e ? "—" : e.ok ? "OK" : "ERRO");

function situacao(o: ResultadoObraCorpus): string {
  if (o.processo) return "PROCESSO";
  if (!o.importacao.ok) return "IMPORTAÇÃO";
  if (!o.calculo.original?.ok || !o.calculo.corrigido?.ok) return "CÁLCULO";
  return "OK";
}

const celula = (s: string, max = 110) => {
  const t = s.replaceAll("|", "\\|").replaceAll("\n", " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function tabela(obras: ResultadoObraCorpus[]): string {
  const linhas = [
    "| obra | arq. | import. | ms | av. imp. | original | ms | av. | corrigido | ms | av. | erro / exceção |",
    "| --- | --: | --- | --: | --: | --- | --: | --: | --- | --: | --: | --- |",
  ];
  for (const o of obras) {
    const c = o.calculo;
    const erro = o.processo ?? o.importacao.erro ?? c.original?.erro ?? c.corrigido?.erro ?? "";
    linhas.push(
      `| ${o.id} | ${o.arquivos.length} | ${estado(o.importacao)} | ${o.importacao.ms} | ${o.importacao.avisos.length} | ${estado(c.original)} | ${c.original?.ms ?? ""} | ${c.original?.avisos ?? ""} | ${estado(c.corrigido)} | ${c.corrigido?.ms ?? ""} | ${c.corrigido?.avisos ?? ""} | ${celula(erro)} |`,
    );
  }
  const conta = new Map<string, number>();
  for (const o of obras) conta.set(situacao(o), (conta.get(situacao(o)) ?? 0) + 1);
  linhas.push(
    "",
    `Total: ${obras.length} obras; ${[...conta].map(([k, n]) => `${k} ${n}`).join(", ")}.`,
  );
  return linhas.join("\n");
}

function comparar(antes: Rodada, depois: Rodada): string {
  const porId = new Map(antes.obras.map((o) => [o.id, o]));
  const mudancas: string[] = [];
  for (const o of depois.obras) {
    const a = porId.get(o.id);
    const sa = a ? situacao(a) : "(nova)";
    const sd = situacao(o);
    if (sa !== sd) mudancas.push(`- ${o.id}: ${sa} → ${sd}`);
  }
  return [
    `Comparação ${antes.rotulo} (${antes.commit}) → ${depois.rotulo} (${depois.commit}):`,
    ...(mudancas.length ? mudancas : ["- nenhuma obra mudou de estado"]),
  ].join("\n");
}

/** Commit do checkout e, se houver, quantos arquivos estão modificados fora dele. */
function commitDe(v2: string): string {
  const git = (...args: string[]) =>
    Bun.spawnSync({ cmd: ["git", "-C", v2, ...args] })
      .stdout.toString()
      .trim();
  const sujos = git("status", "--porcelain").split("\n").filter(Boolean).length;
  return `${git("log", "-1", "--format=%h %s")}${sujos ? ` (+${sujos} arquivos não commitados)` : ""}`;
}

async function principal() {
  const a = argumentos(process.argv.slice(2));
  const v2 = resolve(a.get("v2") ?? "");
  if (!a.get("v2") || !ehPasta(join(v2, "src/telas"))) {
    console.error("Uso: bun scripts/sistrut/importar-corpus.ts --v2 <raiz da V2> [opções]");
    process.exit(2);
  }

  const umaObra = a.get("obra");
  if (umaObra) {
    const r = await rodarObra(v2, JSON.parse(umaObra) as PastaObra);
    console.log(MARCA + JSON.stringify(r));
    return;
  }

  const rotulo = a.get("rotulo") || basename(v2);
  const filtro = a.get("filtro");
  const paralelo = Number(a.get("paralelo") || 4);
  const limiteS = Number(a.get("limite-s") || 120);
  const alvos = descobrir().filter((o) => !filtro || o.id.includes(filtro));
  console.error(`${alvos.length} obras; V2 em ${v2}`);

  const obras: ResultadoObraCorpus[] = [];
  let proxima = 0;
  await Promise.all(
    Array.from({ length: paralelo }, async () => {
      while (proxima < alvos.length) {
        const i = proxima++;
        const alvo = alvos[i];
        if (!alvo) break;
        obras[i] = await noFilho(v2, alvo, limiteS);
        console.error(`[${i + 1}/${alvos.length}] ${situacao(obras[i])} ${alvo.id}`);
      }
    }),
  );

  const rodada: Rodada = {
    rotulo,
    v2,
    commit: commitDe(v2),
    data: new Date().toISOString(),
    obras,
  };
  const saida =
    a.get("saida") ||
    `C:/tmp/corpus/${rotulo}-${rodada.data.slice(0, 19).replaceAll(":", "")}.json`;
  mkdirSync(resolve(saida, ".."), { recursive: true });
  writeFileSync(saida, JSON.stringify(rodada, null, 1));

  console.log(`## Corpus: ${rotulo} (${rodada.commit})\n`);
  console.log(tabela(obras));
  console.log(`\nJSON: ${saida}`);
  const anterior = a.get("compara");
  if (anterior)
    console.log(`\n${comparar(JSON.parse(readFileSync(anterior, "utf8")) as Rodada, rodada)}`);
}

await principal();
